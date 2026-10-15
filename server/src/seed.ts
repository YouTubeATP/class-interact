import type { PrismaClient } from '@prisma/client';
import msg from '../seed/msg-secret-ingredient.json';
import workshop from '../seed/workshop-activities.json';
import { PresentationService } from './services/presentations';

export const DEMO_PRESENTATIONS = [msg, workshop] as const;

/**
 * Imports the demo presentations through the same JSON import pipeline users get
 * (validation, defaults, normalisation). Idempotent: a presentation that already exists by title is skipped.
 */
export async function seedDemo(prisma: PrismaClient): Promise<{ created: string[]; skipped: string[] }> {
  const service = new PresentationService(prisma);
  const created: string[] = [];
  const skipped: string[] = [];
  for (const doc of DEMO_PRESENTATIONS) {
    const exists = await prisma.presentation.findFirst({ where: { title: doc.title }, select: { id: true } });
    if (exists) {
      skipped.push(doc.title);
      continue;
    }
    await service.importDoc(doc);
    created.push(doc.title);
  }
  return { created, skipped };
}
