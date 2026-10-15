import { ImageOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { checkImageUrl } from '@classinteract/shared';
import { cn } from '@/lib/cn';

/**
 * Renders an image from presentation JSON defensively: the URL is re-validated, no referrer is sent,
 * and a failed or blocked load shows a calm placeholder instead of a broken-image icon.
 */
export function SafeImage({ src, alt, fit = 'cover', className, showWhyFailed = false }: { src: string; alt: string; fit?: 'cover' | 'contain'; className?: string; showWhyFailed?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setFailed(false); setLoaded(false); }, [src]);
  const unsafe = checkImageUrl(src);

  if (failed || unsafe) {
    return (
      <div role="img" aria-label={alt || 'Image unavailable'} data-testid="image-fallback" className={cn('grid place-items-center bg-ink/5 text-ink-3', className)}>
        <div className="grid justify-items-center gap-2 p-4 text-center">
          <ImageOff className="size-[1.6em]" aria-hidden />
          <span className="text-[0.8em] font-medium">{showWhyFailed ? (unsafe ?? 'This image could not be loaded.') : 'Image unavailable'}</span>
        </div>
      </div>
    );
  }
  return (
    <div className={cn('relative overflow-hidden bg-ink/4', className)}>
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={cn('size-full transition-opacity duration-300', fit === 'cover' ? 'object-cover' : 'object-contain', loaded ? 'opacity-100' : 'opacity-0')}
      />
    </div>
  );
}
