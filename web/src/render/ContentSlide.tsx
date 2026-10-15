import { AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { resolveContentLayout, type ContentConfig } from '@classinteract/shared';
import { RichText } from '@/components/RichText';
import { SafeImage } from '@/components/SafeImage';
import { cn } from '@/lib/cn';

const calloutStyle = {
  info: { icon: Info, cls: 'bg-[#d9eaff] text-[#10346b]' },
  warning: { icon: AlertTriangle, cls: 'bg-warn-soft text-[#5d3600]' },
  success: { icon: CheckCircle2, cls: 'bg-ok-soft text-[#0b4a30]' },
} as const;

const rise = (i: number) => ({ initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { type: 'spring' as const, stiffness: 240, damping: 26, delay: 0.08 + i * 0.07 } });

function Callout({ c }: { c: NonNullable<ContentConfig['callout']> }) {
  const s = calloutStyle[c.tone];
  return (
    <motion.div {...rise(5)} className={cn('flex items-start gap-[0.7em] rounded-[0.9em] px-[1em] py-[0.8em] font-semibold', s.cls)}>
      <s.icon className="mt-[0.2em] size-[1.1em] shrink-0" aria-hidden />
      <span>{c.text}</span>
    </motion.div>
  );
}

function Steps({ steps, cols }: { steps: string[]; cols: number }) {
  return (
    <ol className="grid gap-[0.7em]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {steps.map((s, i) => (
        <motion.li key={i} {...rise(i + 1)} className="flex items-start gap-[0.8em] rounded-[0.9em] bg-surface px-[0.9em] py-[0.75em] ring-1 ring-line">
          <span className="tabular grid size-[1.7em] shrink-0 place-items-center rounded-full bg-accent text-[0.85em] font-extrabold text-white">{i + 1}</span>
          <span className="pt-[0.1em] font-semibold leading-snug">{s}</span>
        </motion.li>
      ))}
    </ol>
  );
}

/**
 * The content-slide renderer: maps a slide's semantic content to one of a small set of
 * layout templates. Sized in `em` — the caller sets the base size (1cqw on the projector).
 * `compact` stacks everything for phones.
 */
export function ContentSlide({ config, compact = false }: { config: ContentConfig; compact?: boolean }) {
  const layout = resolveContentLayout(config);
  const { title, body, steps, image, callout } = config;

  if (compact) {
    return (
      <article className="grid gap-4 text-[1em]">
        {image && layout !== 'title' && <SafeImage src={image.url} alt={image.alt} fit={image.fit} className="aspect-[16/10] w-full rounded-2xl" />}
        {title && <h2 className="display text-[1.9em]">{title}</h2>}
        {body && <RichText text={body} className="text-[1.0625em] text-ink-2" />}
        {steps.length > 0 && <Steps steps={steps} cols={1} />}
        {callout && <Callout c={callout} />}
      </article>
    );
  }

  if (layout === 'full-image' && image) {
    return (
      <div className="absolute inset-0">
        <SafeImage src={image.url} alt={image.alt} fit={image.fit} className="size-full" showWhyFailed />
        {title && <motion.h2 {...rise(0)} className="display absolute bottom-[4%] left-[3.5%] max-w-[80%] rounded-[0.5em] bg-surface/92 px-[0.7em] py-[0.35em] text-[3.4em] shadow-sm">{title}</motion.h2>}
      </div>
    );
  }

  if (layout === 'title') {
    return (
      <div className={cn('grid h-full items-center gap-[4em]', image ? 'grid-cols-[1.25fr_1fr]' : 'grid-cols-1')}>
        <div className="grid max-w-[60em] gap-[0.9em]">
          <motion.h1 {...rise(0)} className="display text-[6.4em]" style={{ textWrap: 'balance' }}>{title}</motion.h1>
          {body && <motion.p {...rise(1)} className="max-w-[28em] text-[2.7em] font-medium leading-snug text-ink-2">{body}</motion.p>}
        </div>
        {image && <motion.div {...rise(2)} className="h-[78%]"><SafeImage src={image.url} alt={image.alt} fit={image.fit} className="size-full rounded-[1.4em]" /></motion.div>}
      </div>
    );
  }

  if (layout === 'image-text' && image) {
    return (
      <div className="grid h-full grid-cols-[1.1fr_1fr] items-center gap-[3.5em]">
        <div className="grid content-center gap-[1em]">
          {title && <motion.h2 {...rise(0)} className="display text-[4.6em]">{title}</motion.h2>}
          {body && <motion.div {...rise(1)}><RichText text={body} className="text-[2.05em] leading-snug text-ink-2" bulletClassName="gap-[0.5em]" /></motion.div>}
          {steps.length > 0 && <Steps steps={steps} cols={1} />}
          {callout && <Callout c={callout} />}
        </div>
        <motion.div {...rise(2)} className="h-[88%]"><SafeImage src={image.url} alt={image.alt} fit={image.fit} className="size-full rounded-[1.4em] bg-tone" showWhyFailed /></motion.div>
      </div>
    );
  }

  if (layout === 'instructions') {
    const many = steps.length > 4;
    return (
      <div className="grid h-full content-start gap-[1.4em]">
        {title && <motion.h2 {...rise(0)} className="display text-[4.6em]">{title}</motion.h2>}
        {body && <motion.div {...rise(1)}><RichText text={body} className="max-w-[50em] text-[2em] text-ink-2" /></motion.div>}
        {steps.length > 0 && <div className="text-[1.95em]"><Steps steps={steps} cols={many ? 2 : 1} /></div>}
        {callout && <div className="text-[1.9em]"><Callout c={callout} /></div>}
      </div>
    );
  }

  // text
  return (
    <div className="grid h-full content-start gap-[1.3em]">
      {title && <motion.h2 {...rise(0)} className="display text-[4.8em]">{title}</motion.h2>}
      {body && <motion.div {...rise(1)}><RichText text={body} className="max-w-[46em] text-[2.3em] leading-snug text-ink-2" bulletClassName="gap-[0.5em]" /></motion.div>}
      {steps.length > 0 && <div className="text-[1.95em]"><Steps steps={steps} cols={steps.length > 4 ? 2 : 1} /></div>}
      {callout && <div className="text-[1.9em]"><Callout c={callout} /></div>}
    </div>
  );
}
