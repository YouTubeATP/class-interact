import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { join, resolve } from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { PrismaClient } from '@prisma/client';
import { Server as IOServer } from 'socket.io';
import {
  TEMPLATES, exportPresentationJson, featuresPatchSchema, importJsonSlides, joinRequestSchema, presentationJsonSchema, suggestMerges,
  type ClientConfig, type ProjectorClaim, type SessionControlInfo,
} from '@classinteract/shared';
import { z } from 'zod';
import { createAuth } from './auth';
import type { Config } from './config';
import { AppError, badRequest, notFound } from './lib/errors';
import { lanUrls } from './lan';
import { aiChatHandler } from './ai/chat';
import { aiTasks } from './ai/tasks';
import { LearnerService } from './services/learners';
import { createTextFilter } from './lib/moderation';
import { attachGateway } from './realtime/gateway';
import { PresentationService } from './services/presentations';
import { ReportService } from './services/reports';
import { SessionService } from './services/sessions';

const VERSION = '1.0.0';

const IMAGE_TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  'image/png': { ext: 'png', magic: (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) },
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  'image/gif': { ext: 'gif', magic: (b) => b.subarray(0, 3).toString() === 'GIF' },
  'image/webp': { ext: 'webp', magic: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
};

/** Video and audio uploads (larger limit), checked by their signatures like images. */
const MEDIA_TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  'video/mp4': { ext: 'mp4', magic: (b) => b.subarray(4, 8).toString() === 'ftyp' },
  'audio/mp4': { ext: 'm4a', magic: (b) => b.subarray(4, 8).toString() === 'ftyp' },
  'audio/x-m4a': { ext: 'm4a', magic: (b) => b.subarray(4, 8).toString() === 'ftyp' },
  'video/webm': { ext: 'webm', magic: (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
  'audio/webm': { ext: 'webm', magic: (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
  'audio/mpeg': { ext: 'mp3', magic: (b) => b.subarray(0, 3).toString() === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  'audio/ogg': { ext: 'ogg', magic: (b) => b.subarray(0, 4).toString() === 'OggS' },
  'audio/wav': { ext: 'wav', magic: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WAVE' },
  'audio/x-wav': { ext: 'wav', magic: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WAVE' },
};

export function createApp(opts: { prisma: PrismaClient; config: Config }) {
  const { prisma, config } = opts;
  const auth = createAuth(config);
  const filter = createTextFilter(config.extraBlockedWords);
  const sessions = new SessionService(prisma, config, auth, filter);
  const presentations = new PresentationService(prisma);
  const reports = new ReportService(prisma);
  const learners = new LearnerService(prisma);
  const ai = aiTasks(config);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  // --- security headers ---------------------------------------------------------------
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    if (config.production) {
      res.setHeader(
        'Content-Security-Policy',
        ["default-src 'self'", "img-src 'self' https: http: data: blob:", "style-src 'self' 'unsafe-inline'", "script-src 'self'", "connect-src 'self' ws: wss:", "font-src 'self' data:", "media-src 'self' https: blob:", "frame-src https://www.youtube-nocookie.com https://player.vimeo.com", "frame-ancestors 'self'", "base-uri 'self'", "form-action 'self'"].join('; '),
      );
    }
    next();
  });

  // Uploaded images: never executable, never sniffed
  app.use('/uploads', express.static(config.uploadDir, { maxAge: '30d', immutable: true, index: false, setHeaders: (res) => { res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; sandbox"); } }));

  const api = express.Router();
  api.use(express.json({ limit: '2mb' }));

  const limit = (windowMs: number, max: number, message: string) =>
    config.rateLimit
      ? rateLimit({ windowMs, limit: max, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message } } })
      : (_req: Request, _res: Response, next: NextFunction) => next();

  // --- public ------------------------------------------------------------------------
  api.get('/health', (_req, res) => res.json({ ok: true, version: VERSION }));

  api.get('/config', (_req, res) => {
    // Inside a container the interface addresses are internal (172.x) and useless to phones, so only
    // offer LAN addresses when running directly on a developer machine.
    const body: ClientConfig = { publicUrl: config.publicUrl, lanUrls: config.production ? [] : lanUrls(config.port), authRequired: auth.studioProtected, aiEnabled: !!config.aiApiKey, version: VERSION };
    res.json(body);
  });

  api.get('/schema/presentation.json', (_req, res) => res.json(presentationJsonSchema()));

  api.get('/join/:pin', limit(60_000, 240, 'Too many attempts. Wait a minute and try again.'), async (req, res) => {
    const pin = String(req.params.pin);
    if (!/^\d{6}$/.test(pin)) throw badRequest('The code is 6 digits.');
    res.json(await sessions.lookupPin(pin));
  });

  // Turns a screen-side computer into the projector. The code is separate from the join PIN and is only shown in the
  // presenter's dashboard. What it unlocks is the audience-safe projector view, and guessing is rate limited.
  api.post('/projector/claim', limit(60_000, 30, 'Too many attempts. Wait a minute and try again.'), async (req, res) => {
    const code = typeof req.body?.code === 'string' ? req.body.code.replace(/\D/g, '') : '';
    if (!/^\d{6}$/.test(code)) throw badRequest('The code is 6 digits.');
    const id = await sessions.sessionForProjectorCode(code);
    if (!id) throw notFound('No live session with that code. Check the digits and try again.');
    const body: ProjectorClaim = { sessionId: id, projectorKey: auth.projectorKey(id) };
    res.json(body);
  });

  // A teaching assistant opens their access link: the token is checked and exchanged for control credentials.
  api.post('/delegate/claim', limit(60_000, 30, 'Too many attempts. Wait a minute and try again.'), async (req, res) => {
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const g = sessionId && token ? await sessions.authDelegate(sessionId, token) : null;
    if (!g) throw new AppError(401, 'UNAUTHORIZED', 'This access link is not valid or was revoked. Ask the presenter for a new one.');
    const body: SessionControlInfo = { sessionId, presenterToken: token, role: g.role, projectorKey: g.role === 'copresenter' ? auth.projectorKey(sessionId) : '', projectorCode: null };
    res.json(body);
  });

  // A participant deletes their own "remember me" identity (or changes whether the teacher sees their progress).
  api.post('/learner/forget', limit(60_000, 20, 'Too many attempts.'), async (req, res) => {
    const key = typeof req.body?.key === 'string' ? req.body.key : '';
    res.json({ ok: !!key && (await learners.forget(key)) });
  });
  api.post('/learner/share', limit(60_000, 20, 'Too many attempts.'), async (req, res) => {
    const key = typeof req.body?.key === 'string' ? req.body.key : '';
    res.json({ ok: !!key && (await learners.setSharing(key, !!req.body?.share)) });
  });

  // Generous per-IP limit: a whole classroom often shares one network address.
  api.post('/join', limit(60_000, 400, 'Too many people are joining from this network. Wait a minute and try again.'), async (req, res) => {
    const parsed = joinRequestSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Invalid request');
    res.json(await sessions.join(parsed.data));
  });

  api.post('/auth/login', limit(60_000, 10, 'Too many sign-in attempts. Wait a minute.'), (req, res) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!auth.studioProtected) return void res.json({ token: auth.issueStudioToken() });
    if (!auth.checkPassword(password)) throw new AppError(401, 'UNAUTHORIZED', 'That password is not correct.');
    res.json({ token: auth.issueStudioToken() });
  });

  // --- studio (presenter) ------------------------------------------------------------
  const studio = express.Router();
  studio.use((req, _res, next) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!auth.verifyStudioToken(token)) return next(new AppError(401, 'UNAUTHORIZED', 'Sign in to use the Presenter Studio.'));
    next();
  });

  // The AI assistant. Studio-only (so it needs the Studio password when one is set) and rate limited, because every call costs money.
  studio.post('/ai/chat', limit(60_000, 30, 'The assistant is getting a lot of requests. Wait a moment and try again.'), aiChatHandler(config));

  studio.get('/presentations', async (_req, res) => res.json(await presentations.list()));

  studio.post('/presentations', async (req, res) => {
    const title = typeof req.body?.title === 'string' && req.body.title.trim() ? req.body.title.trim().slice(0, 140) : 'Untitled presentation';
    res.status(201).json(await presentations.create(title));
  });

  studio.post('/presentations/import', async (req, res) => {
    const r = await presentations.importDoc(req.body);
    res.status(201).json(r);
  });

  studio.get('/presentations/:id', async (req, res) => res.json(await presentations.get(String(req.params.id))));

  studio.put('/presentations/:id', async (req, res) => res.json(await presentations.replace(String(req.params.id), req.body)));

  studio.post('/presentations/:id/duplicate', async (req, res) => res.status(201).json(await presentations.duplicate(String(req.params.id))));

  studio.delete('/presentations/:id', async (req, res) => {
    await presentations.remove(String(req.params.id));
    res.status(204).end();
  });

  studio.get('/presentations/:id/export', async (req, res) => {
    const { doc } = await presentations.get(String(req.params.id));
    const slug = doc.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'presentation';
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.classinteract.json"`);
    res.send(exportPresentationJson(doc));
  });

  const startSchema = z.object({
    collectNames: z.boolean().default(true),
    mode: z.enum(['standalone', 'companion', 'selfpaced']).default('standalone'),
    features: featuresPatchSchema.optional(),
  });
  studio.post('/presentations/:id/sessions', async (req, res) => {
    const parsed = startSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw badRequest('Invalid session options');
    const s = await sessions.createSession(String(req.params.id), parsed.data);
    res.status(201).json(s);
  });

  // Rehearsal: a private session with simulated participants (never counted in analytics or cross-session reports).
  const rehearseSchema = z.object({ participants: z.number().int().min(0).max(60).default(12), mode: z.enum(['standalone', 'companion', 'selfpaced']).default('standalone') });
  studio.post('/presentations/:id/rehearse', async (req, res) => {
    const parsed = rehearseSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw badRequest('Invalid rehearsal options');
    const s = await sessions.createSession(String(req.params.id), { collectNames: false, mode: parsed.data.mode, rehearsal: true });
    if (parsed.data.participants) await sessions.simulate(s.id, parsed.data.participants);
    res.status(201).json(s);
  });

  studio.get('/templates', (_req, res) => res.json(TEMPLATES.map(({ doc: _d, ...t }) => t)));
  studio.post('/templates/:id', async (req, res) => {
    const t = TEMPLATES.find((x) => x.id === req.params.id);
    if (!t) throw notFound('Template not found');
    res.status(201).json(await presentations.importDoc(t.doc));
  });

  // AI helpers (optional). Their output is validated or needs approval before it changes anything.
  studio.post('/ai/convert', limit(60_000, 10, 'Too many requests. Wait a moment.'), async (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    if (text.trim().length < 20) throw badRequest('Paste at least a few sentences of teaching material.');
    if (text.length > 20_000) throw new AppError(413, 'TOO_LARGE', 'Paste at most 20,000 characters at a time.');
    const slides = await ai.convert(text);
    res.json(importJsonSlides(JSON.stringify(slides), Array.isArray(req.body?.existingIds) ? req.body.existingIds.filter((x: unknown) => typeof x === 'string') : []));
  });

  studio.get('/sessions', async (_req, res) => res.json(await sessions.listSessions()));

  studio.get('/sessions/:id/control', async (req, res) => {
    const id = String(req.params.id);
    if (!(await sessions.sessionExists(id))) throw notFound('Session not found');
    const body: SessionControlInfo = { sessionId: id, presenterToken: auth.presenterToken(id), role: 'owner', projectorKey: auth.projectorKey(id), projectorCode: await sessions.projectorCodeFor(id) };
    res.json(body);
  });

  const grantSchema = z.object({ role: z.enum(['copresenter', 'moderator']), label: z.string().max(60).default('') });
  studio.post('/sessions/:id/grants', async (req, res) => {
    const parsed = grantSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw badRequest('Choose a role: co-presenter or moderator.');
    const g = await sessions.createGrant(String(req.params.id), parsed.data.role, parsed.data.label);
    // the token is shown once, inside the link; only its hash is stored
    res.status(201).json({ id: g.id, token: g.token, path: `/remote/${req.params.id}#g=${encodeURIComponent(g.token)}` });
  });
  studio.delete('/sessions/:id/grants/:grantId', async (req, res) => {
    await sessions.revokeGrant(String(req.params.id), String(req.params.grantId));
    res.status(204).end();
  });

  studio.get('/sessions/:id/analytics', async (req, res) => res.json(await reports.analytics(String(req.params.id))));
  studio.post('/sessions/:id/recap/ai', limit(60_000, 10, 'Too many requests. Wait a moment.'), async (req, res) => {
    const { analytics, recap } = await reports.analytics(String(req.params.id));
    // aggregates only: no names, no individual answers
    const summary = { recap, questions: analytics.questions.map((q) => ({ title: q.title, type: q.type, respondents: q.respondents, correctRate: q.correctRate, difficulty: q.difficulty })), concepts: analytics.concepts, comparisons: analytics.comparisons.map((c) => ({ title: c.title, beforeRate: c.beforeRate, afterRate: c.afterRate })) };
    res.json({ text: await ai.recap(summary) });
  });
  studio.post('/sessions/:id/grouping/ai', limit(60_000, 10, 'Too many requests. Wait a moment.'), async (req, res) => {
    const terms = Array.isArray(req.body?.terms) ? req.body.terms.filter((t: any) => typeof t?.key === 'string' && typeof t?.label === 'string').slice(0, 200) : [];
    if (terms.length < 2) return void res.json({ suggestions: [] });
    const groups = await ai.grouping(terms.map((t: any) => ({ key: t.key, label: t.label, count: Number(t.count) || 1 })));
    const byKey = new Map(terms.map((t: any) => [t.key, t]));
    res.json({ suggestions: groups.map((g) => ({ into: [...g.keys].sort((a, b) => ((byKey.get(b) as any)?.count ?? 0) - ((byKey.get(a) as any)?.count ?? 0))[0], keys: g.keys, labels: g.keys.map((k) => (byKey.get(k) as any)?.label ?? k), reason: `AI suggestion: ${g.reason}` })) });
  });
  studio.post('/grouping/suggest', (req, res) => {
    const terms = Array.isArray(req.body?.terms) ? req.body.terms : [];
    res.json({ suggestions: suggestMerges(terms.filter((t: any) => typeof t?.key === 'string').slice(0, 500)) });
  });

  studio.get('/learners', async (_req, res) => res.json(await learners.report()));
  studio.patch('/learners/:id', async (req, res) => {
    await learners.setLabel(String(req.params.id), typeof req.body?.label === 'string' ? req.body.label : '');
    res.status(204).end();
  });
  studio.delete('/learners/:id', async (req, res) => {
    await learners.remove(String(req.params.id));
    res.status(204).end();
  });

  studio.get('/sessions/:id/results', async (req, res) => res.json(await reports.results(String(req.params.id))));

  studio.get('/sessions/:id/export.csv', async (req, res) => {
    const { filename, csv } = await reports.csv(String(req.params.id));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  });

  studio.delete('/sessions/:id', async (req, res) => {
    await sessions.deleteSession(String(req.params.id));
    res.status(204).end();
  });

  studio.post('/uploads/media', express.raw({ type: Object.keys(MEDIA_TYPES), limit: '25mb' }), (req, res) => {
    const type = (req.headers['content-type'] ?? '').split(';')[0].trim();
    const spec = MEDIA_TYPES[type];
    if (!spec) throw badRequest('Upload an MP4 or WebM video, or an MP3, M4A, OGG or WAV audio file (25 MB at most).');
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length < 12) throw badRequest('The file was empty.');
    if (!spec.magic(body)) throw badRequest('That file does not look like the format it claims to be.');
    const name = `${randomBytes(12).toString('hex')}.${spec.ext}`;
    writeFileSync(join(config.uploadDir, name), body);
    res.status(201).json({ url: `/uploads/${name}` });
  });

  studio.post('/uploads', express.raw({ type: Object.keys(IMAGE_TYPES), limit: '5mb' }), (req, res) => {
    const type = (req.headers['content-type'] ?? '').split(';')[0].trim();
    const spec = IMAGE_TYPES[type];
    if (!spec) throw badRequest('Upload a PNG, JPEG, GIF or WebP image.');
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest('The image was empty.');
    if (!spec.magic(body)) throw badRequest('That file does not look like a valid image.');
    const name = `${randomBytes(12).toString('hex')}.${spec.ext}`;
    writeFileSync(join(config.uploadDir, name), body);
    res.status(201).json({ url: `/uploads/${name}` });
  });

  api.use('/studio', studio);
  api.use((_req, _res, next) => next(notFound('Unknown API route')));
  app.use('/api', api);

  // --- built web app (production) ------------------------------------------------------
  const webDist = config.webDist ?? resolve(process.cwd(), '../web/dist');
  if (existsSync(join(webDist, 'index.html'))) {
    app.use(express.static(webDist, { index: false, maxAge: '1h', setHeaders: (res, p) => { if (p.includes('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); } }));
    app.use((req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(webDist, 'index.html'));
    });
  }

  // --- errors --------------------------------------------------------------------------
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      return void res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } });
    }
    const e = err as { type?: string; status?: number };
    if (e.type === 'entity.too.large') return void res.status(413).json({ error: { code: 'TOO_LARGE', message: 'That file or document is too large.' } });
    if (e.type === 'entity.parse.failed') return void res.status(400).json({ error: { code: 'INVALID', message: 'The request body is not valid JSON.' } });
    console.error('[http] unexpected error', err);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on the server.' } });
  });

  // --- realtime --------------------------------------------------------------------------
  const server = http.createServer(app);
  const io = new IOServer(server, {
    serveClient: false,
    maxHttpBufferSize: 64 * 1024,
    pingInterval: 20_000,
    pingTimeout: 25_000,
    cors: config.corsOrigins.length ? { origin: config.corsOrigins } : undefined,
  });
  const gateway = attachGateway(io, sessions, auth, { rateLimit: config.rateLimit });

  const sweep = setInterval(() => void sessions.endIdleSessions().catch((e) => console.error('[sweep]', e)), 10 * 60_000);
  sweep.unref();

  return {
    app,
    server,
    io,
    auth,
    sessions,
    presentations,
    reports,
    learners,
    async close() {
      clearInterval(sweep);
      gateway.close();
      sessions.shutdown();
      await new Promise<void>((r) => io.close(() => r()));
      if (server.listening) await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
