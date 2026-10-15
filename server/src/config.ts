import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  uploadDir: string;
  publicUrl: string | null;
  studioPassword: string | null;
  secret: string | null;
  trustProxy: number | boolean | string;
  maxParticipants: number;
  sessionIdleHours: number;
  autoSeed: boolean;
  webDist: string | null;
  rateLimit: boolean;
  corsOrigins: string[];
  extraBlockedWords: string[];
  production: boolean;
}

function int(v: string | undefined, fallback: number): number {
  const n = v === undefined || v === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, overrides: Partial<Config> = {}): Config {
  const dataDir = resolve(env.DATA_DIR || 'data');
  const trust = env.TRUST_PROXY;
  const cfg: Config = {
    port: int(env.PORT, 3001),
    host: env.HOST || '0.0.0.0',
    dataDir,
    uploadDir: resolve(env.UPLOAD_DIR || resolve(dataDir, 'uploads')),
    publicUrl: env.PUBLIC_URL ? env.PUBLIC_URL.replace(/\/+$/, '') : null,
    studioPassword: env.STUDIO_PASSWORD || null,
    secret: env.SERVER_SECRET || null,
    trustProxy: trust === undefined || trust === '' ? false : trust === 'true' ? true : trust === 'false' ? false : /^\d+$/.test(trust) ? Number(trust) : trust,
    maxParticipants: int(env.MAX_PARTICIPANTS, 500),
    sessionIdleHours: int(env.SESSION_IDLE_HOURS, 24),
    autoSeed: env.AUTO_SEED === 'true',
    webDist: env.WEB_DIST ? resolve(env.WEB_DIST) : null,
    rateLimit: env.RATE_LIMIT !== 'false',
    corsOrigins: (env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    extraBlockedWords: (env.EXTRA_BLOCKED_WORDS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    production: env.NODE_ENV === 'production',
    ...overrides,
  };
  mkdirSync(cfg.dataDir, { recursive: true });
  mkdirSync(cfg.uploadDir, { recursive: true });
  return cfg;
}
