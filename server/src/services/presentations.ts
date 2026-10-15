import type { PrismaClient } from '@prisma/client';
import {
  SCHEMA_VERSION, DOCUMENT_FORMAT, isInteractiveType, parsePresentationDoc, parseSlideConfig,
  type PresentationDoc, type PresentationSummary, type Slide, type SlideType, type Theme,
} from '@classinteract/shared';
import { AppError, notFound } from '../lib/errors';

type ActivityRow = { key: string; type: string; config: string; position: number };

export function rowToSlide(row: Pick<ActivityRow, 'key' | 'type' | 'config'>): Slide {
  const type = row.type as SlideType;
  const config = parseSlideConfig(type, JSON.parse(row.config));
  if (!config.success) throw new Error(`Stored slide "${row.key}" no longer matches the schema: ${config.error.message}`);
  return { id: row.key, type, ...config.data } as Slide;
}

export function slideToRow(slide: Slide, position: number) {
  const { id, type, ...config } = slide;
  return { key: id, type, position, config: JSON.stringify(config) };
}

export class PresentationService {
  constructor(private prisma: PrismaClient) {}

  async list(): Promise<PresentationSummary[]> {
    const rows = await this.prisma.presentation.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { activities: { select: { type: true } }, _count: { select: { sessions: true } } },
    });
    return rows.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      slideCount: p.activities.length,
      interactiveCount: p.activities.filter((a) => isInteractiveType(a.type as SlideType)).length,
      theme: JSON.parse(p.theme) as Theme,
      updatedAt: p.updatedAt.toISOString(),
      sessionCount: p._count.sessions,
    }));
  }

  async get(id: string): Promise<{ id: string; updatedAt: string; doc: PresentationDoc }> {
    const p = await this.prisma.presentation.findUnique({ where: { id }, include: { activities: { orderBy: { position: 'asc' } } } });
    if (!p) throw notFound('Presentation not found');
    return {
      id: p.id,
      updatedAt: p.updatedAt.toISOString(),
      doc: {
        format: DOCUMENT_FORMAT,
        schemaVersion: SCHEMA_VERSION,
        title: p.title,
        description: p.description,
        theme: JSON.parse(p.theme),
        slides: p.activities.map(rowToSlide),
      },
    };
  }

  /** Validates raw JSON through the import pipeline. Throws AppError(422) with every problem listed. */
  validate(raw: unknown): { doc: PresentationDoc; warnings: string[] } {
    const parsed = parsePresentationDoc(raw);
    if (!parsed.ok) throw new AppError(422, 'INVALID_PRESENTATION', 'The presentation JSON has problems', { issues: parsed.errors });
    return { doc: parsed.doc, warnings: parsed.warnings };
  }

  /** Create from raw JSON (import, seed, duplicate). */
  async importDoc(raw: unknown): Promise<{ id: string; warnings: string[] }> {
    const { doc, warnings } = this.validate(raw);
    const created = await this.prisma.presentation.create({
      data: {
        title: doc.title,
        description: doc.description,
        theme: JSON.stringify(doc.theme),
        schemaVersion: doc.schemaVersion,
        activities: { create: doc.slides.map((s, i) => slideToRow(s, i)) },
      },
    });
    return { id: created.id, warnings };
  }

  async create(title: string): Promise<{ id: string }> {
    const { id } = await this.importDoc({ schemaVersion: SCHEMA_VERSION, title, slides: [] });
    return { id };
  }

  /** Replace the whole presentation (editor autosave and JSON "apply"). */
  async replace(id: string, raw: unknown): Promise<{ updatedAt: string; warnings: string[] }> {
    const { doc, warnings } = this.validate(raw);
    const existing = await this.prisma.presentation.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw notFound('Presentation not found');
    const updated = await this.prisma.$transaction(async (tx) => {
      const keys = doc.slides.map((s) => s.id);
      await tx.activity.deleteMany({ where: { presentationId: id, key: { notIn: keys } } });
      for (const [i, slide] of doc.slides.entries()) {
        const row = slideToRow(slide, i);
        await tx.activity.upsert({
          where: { presentationId_key: { presentationId: id, key: row.key } },
          create: { ...row, presentationId: id },
          update: { type: row.type, config: row.config, position: row.position },
        });
      }
      return tx.presentation.update({
        where: { id },
        data: { title: doc.title, description: doc.description, theme: JSON.stringify(doc.theme), schemaVersion: doc.schemaVersion },
      });
    });
    return { updatedAt: updated.updatedAt.toISOString(), warnings };
  }

  async duplicate(id: string): Promise<{ id: string }> {
    const { doc } = await this.get(id);
    const { id: newId } = await this.importDoc({ ...doc, title: `${doc.title} (copy)`.slice(0, 140) });
    return { id: newId };
  }

  async remove(id: string): Promise<void> {
    const r = await this.prisma.presentation.deleteMany({ where: { id } });
    if (r.count === 0) throw notFound('Presentation not found');
  }
}

export { isInteractiveType };
