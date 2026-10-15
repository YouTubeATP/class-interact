import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { prettyPin } from '@/lib/joinUrl';
import { QRCode } from './QRCode';

/**
 * The session ticket: QR on the stub, PIN on the body. Sized entirely in `em`, so
 * set `fontSize` on the wrapper (rem on screens, cqw on the projector) and it scales as one piece.
 */
export function Ticket({ pin, url, host, variant = 'hero', className, style, animate = false }: { pin: string; url: string; host: string; variant?: 'hero' | 'mini' | 'card'; className?: string; style?: React.CSSProperties; animate?: boolean }) {
  const digits = prettyPin(pin).split('');
  const big = variant === 'hero';
  return (
    <div className={cn('ticket', className)} style={{ ['--stub' as string]: big ? '36%' : '34%', ...style }}>
      <div className="grid place-items-center" style={{ padding: big ? '1.1em' : '0.7em' }}>
        <motion.div className="w-full overflow-hidden rounded-[0.5em]" initial={animate ? { opacity: 0, scale: 0.9 } : false} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.1 }}>
          <QRCode value={url} className="block aspect-square w-full" />
        </motion.div>
      </div>
      <div className="grid content-center" style={{ padding: big ? '1.5em 2em 1.5em 1.8em' : '0.8em 1.1em 0.8em 1em', gap: big ? '0.35em' : '0.15em' }}>
        <p className="text-ink-2" style={{ fontSize: big ? '1.05em' : '0.72em', lineHeight: 1.25 }}>
          Scan, or go to <strong className="font-semibold text-ink">{host}</strong>
        </p>
        <p className="display tabular text-ink" style={{ fontSize: big ? '4.4em' : variant === 'card' ? '2.1em' : '2.3em', letterSpacing: '-0.02em', lineHeight: 1 }} aria-label={`Session code ${pin.split('').join(' ')}`}>
          {digits.map((d, i) =>
            d === ' ' ? (
              <span key={i} className="inline-block w-[0.32em]" />
            ) : (
              <motion.span key={i} className="inline-block" initial={animate ? { y: '0.35em', opacity: 0 } : false} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 26, delay: animate ? 0.25 + i * 0.07 : 0 }} aria-hidden>
                {d}
              </motion.span>
            ),
          )}
        </p>
      </div>
    </div>
  );
}
