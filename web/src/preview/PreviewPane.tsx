import { ChevronLeft, ChevronRight, Monitor, Smartphone } from 'lucide-react';
import { useMemo, useState } from 'react';
import { definitions, type Ack, type MySubmission, type PresentationDoc } from '@classinteract/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useJoinInfo } from '@/lib/joinUrl';
import { ParticipantApp } from '@/participant/ParticipantApp';
import { ReferenceStage } from '@/render/ReferenceStage';
import { StageView } from '@/render/StageView';
import { previewParticipantSnapshot, previewStageModel, type PreviewView } from './model';

/** A fake submit for the phone preview: accepts everything locally, sends nothing. */
const previewSubmit = async (_id: string, payload: unknown): Promise<Ack> => ({
  ok: true,
  submission: { id: `local-${Math.random().toString(36).slice(2)}`, slot: 0, payload, status: 'visible', correct: null, score: null } satisfies MySubmission,
}) as Ack;

/**
 * Live preview. It renders the *same components* as the projector (StageView) and the phone (ParticipantApp),
 * so what you see while editing is what the room will see.
 */
export function PreviewPane({ doc, index, onIndexChange, large = false }: { doc: PresentationDoc; index: number; onIndexChange?: (i: number) => void; large?: boolean }) {
  const [device, setDevice] = useState<'projector' | 'phone'>('projector');
  const [view, setView] = useState<PreviewView>('prompt');
  const join = useJoinInfo('123456');
  const slide = doc.slides[index];
  const def = slide ? (definitions[slide.type] as any) : null;
  const behavior = slide && def ? def.behavior(slide) : null;
  const interactive = !!behavior?.interactive;
  const hasAnswer = !!behavior?.hasCorrectAnswer;

  const model = useMemo(() => previewStageModel(doc, index, view, { url: join.url || 'https://example.com/join/123456', host: join.host || 'example.com' }), [doc, index, view, join.url, join.host]);
  const snap = useMemo(() => previewParticipantSnapshot(doc, index, view), [doc, index, view]);
  const phoneKey = `${slide?.id ?? 'none'}:${view}:${slide ? JSON.stringify(slide).length : 0}`;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={device} onValueChange={(v) => setDevice(v as typeof device)}>
          <TabsList>
            <TabsTrigger value="projector"><Monitor className="size-3.5" aria-hidden /> Projector</TabsTrigger>
            <TabsTrigger value="phone"><Smartphone className="size-3.5" aria-hidden /> Phone</TabsTrigger>
          </TabsList>
        </Tabs>
        {interactive && (
          <Tabs value={view} onValueChange={(v) => setView(v as PreviewView)}>
            <TabsList>
              <TabsTrigger value="prompt">Question</TabsTrigger>
              <TabsTrigger value="results">Results</TabsTrigger>
              {hasAnswer && <TabsTrigger value="answer">Answer</TabsTrigger>}
            </TabsList>
          </Tabs>
        )}
      </div>

      {device === 'projector' ? (
        <div className="aspect-video overflow-hidden rounded-2xl border border-line bg-stage-bg shadow-sm" data-testid="preview-stage">
          <ReferenceStage><StageView m={model} /></ReferenceStage>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[22rem] overflow-hidden rounded-[2.2rem] border-[7px] border-ink bg-paper shadow-lg" style={{ height: large ? '40rem' : '34rem' }} data-testid="preview-phone">
          <div className="h-full overflow-y-auto no-scrollbar">
            <ParticipantApp key={phoneKey} snap={snap} status="connected" submit={previewSubmit} rename={async (name) => ({ ok: true, name })} now={Date.now} preview />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Badge variant="neutral">Preview with sample data. Nothing is sent.</Badge>
        {onIndexChange && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Previous slide" disabled={index <= 0} onClick={() => onIndexChange(index - 1)}><ChevronLeft className="size-4" /></Button>
            <span className="tabular min-w-14 text-center text-sm font-semibold text-ink-2">{doc.slides.length ? `${index + 1} / ${doc.slides.length}` : '–'}</span>
            <Button variant="ghost" size="icon-sm" aria-label="Next slide" disabled={index >= doc.slides.length - 1} onClick={() => onIndexChange(index + 1)}><ChevronRight className="size-4" /></Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Small static render of one slide, for library cards and the slide list. */
export function SlideThumb({ doc, index, className }: { doc: PresentationDoc; index: number; className?: string }) {
  const join = { url: 'https://example.com/join/123456', host: 'example.com' };
  const model = useMemo(() => previewStageModel(doc, index, 'prompt', join), [doc, index]);
  return (
    <div className={className} aria-hidden>
      <div className="pointer-events-none size-full overflow-hidden"><StageView m={model} /></div>
    </div>
  );
}
