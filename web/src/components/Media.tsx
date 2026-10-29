import { Film, Music2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { parseMediaUrl, type SlideMedia } from '@classinteract/shared';
import { cn } from '@/lib/cn';

/**
 * Video and audio for slides. Only YouTube (privacy-enhanced domain), Vimeo, and direct files in browser-playable
 * formats are ever embedded; the URL is validated when the slide is saved and parsed again here. Embeds run in a
 * sandboxed iframe with no access to the app. A loading state and a clear error replace the player when needed.
 */
export function MediaPlayer({ media, className, compact = false }: { media: SlideMedia; className?: string; compact?: boolean }) {
  const src = parseMediaUrl(media.url);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const label = media.title || (media.kind === 'audio' ? 'Audio' : 'Video');
  if (!src) return <MediaProblem className={className} text="This media link is not supported." />;

  if (src.provider === 'file') {
    if (state === 'error') return <MediaProblem className={className} text="The file could not be played. Check the link or upload it again." />;
    if (media.kind === 'audio') {
      return (
        <figure className={cn('grid gap-[0.4em] rounded-[0.9em] bg-surface p-[0.8em] ring-1 ring-line', className)} data-testid="media-audio">
          <figcaption className="flex items-center gap-[0.5em] font-semibold text-ink-2"><Music2 className="size-[1.1em]" aria-hidden /> {label}</figcaption>
          <audio controls preload="metadata" src={media.start ? `${src.url}#t=${media.start}` : src.url} className="w-full" onCanPlay={() => setState('ready')} onError={() => setState('error')} aria-label={label} />
        </figure>
      );
    }
    return (
      <div className={cn('relative aspect-video overflow-hidden rounded-[0.9em] bg-black', className)} data-testid="media-video">
        <video controls playsInline preload="metadata" src={media.start ? `${src.url}#t=${media.start}` : src.url} className="size-full" onLoadedMetadata={() => setState('ready')} onError={() => setState('error')} aria-label={label} />
        {state === 'loading' && <Loading />}
      </div>
    );
  }

  const start = media.start ? (src.provider === 'youtube' ? `&start=${media.start}` : `#t=${media.start}s`) : '';
  const url = src.provider === 'youtube'
    ? `https://www.youtube-nocookie.com/embed/${src.id}?rel=0&modestbranding=1&playsinline=1${start}`
    : `https://player.vimeo.com/video/${src.id}?dnt=1${start}`;
  return (
    <div className={cn('relative overflow-hidden rounded-[0.9em] bg-black', media.kind === 'audio' && !compact ? 'aspect-[16/5]' : 'aspect-video', className)} data-testid="media-embed" data-provider={src.provider}>
      <iframe
        src={url}
        title={label}
        className="absolute inset-0 size-full border-0"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        allow="encrypted-media; picture-in-picture; fullscreen; autoplay"
        allowFullScreen
        onLoad={() => setState('ready')}
      />
      {state === 'loading' && <Loading />}
    </div>
  );
}

function Loading() {
  return <div className="absolute inset-0 grid place-items-center text-white/70" aria-hidden><Film className="size-[2em] animate-pulse" /></div>;
}

function MediaProblem({ text, className }: { text: string; className?: string }) {
  return (
    <div role="alert" className={cn('flex items-center gap-[0.6em] rounded-[0.9em] bg-warn-soft px-[1em] py-[0.8em] font-semibold text-warn-ink', className)}>
      <TriangleAlert className="size-[1.2em] shrink-0" aria-hidden /> {text}
    </div>
  );
}

/** On phones a video normally plays on the main screen only. */
export function MediaNotice({ media }: { media: SlideMedia }) {
  return (
    <p className="flex items-center gap-2 rounded-2xl bg-surface px-4 py-3 text-sm font-semibold text-ink-2 ring-1 ring-line" data-testid="media-notice">
      {media.kind === 'audio' ? <Music2 className="size-4 shrink-0" aria-hidden /> : <Film className="size-4 shrink-0" aria-hidden />} {media.kind === 'audio' ? 'Listen to the audio in the room.' : 'Watch the video on the main screen.'}
    </p>
  );
}
