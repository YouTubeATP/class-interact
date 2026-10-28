import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { prettyPin } from '@/lib/joinUrl';
import { ScanSweep } from './Ambient';
import { QRCode } from './QRCode';

/**
 * The session ticket: QR on the stub, PIN on the body. Sized entirely in `em`, so
 * set `fontSize` on the wrapper (rem on screens, cqw on the projector) and it scales as one piece.
 *
 *   hero / mini / card  stub on the left (dashboard card, the corner of the projector during activities)
 *   poster              stub on top: the projector's join screen, where the QR code is the biggest thing in the room
 *
 * The ticket is always light (white paper, dark ink) whatever the app or projector appearance: a QR code needs
 * dark modules on white, and the PIN beside it reads best the same way.
 */
export function Ticket({ pin, url, host, variant = 'hero', className, style, animate = false }: { pin: string; url: string; host: string; variant?: 'hero' | 'mini' | 'card' | 'poster'; className?: string; style?: React.CSSProperties; animate?: boolean }) {
  const digits = prettyPin(pin).split('');
  const pinDigits = (size: string) => (
    <p data-testid="ticket-pin" data-pin={pin} className="display tabular whitespace-nowrap text-ink" style={{ fontSize: size, letterSpacing: '-0.01em', lineHeight: 1 }} aria-label={`Session code ${pin.split('').join(' ')}`}>
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
  );

  if (variant === 'poster') {
    return (
      <div className={cn('ticket-wrap-v', className)} data-appearance="light" style={{ filter: 'drop-shadow(0 0 0.7px rgb(0 0 0 / .45)) drop-shadow(0 0.9em 1.4em rgb(0 0 0 / .22))' }}>
        <div className="ticket ticket-v" style={style} data-testid="join-poster">
          <div className="grid place-items-center" style={{ padding: '0.9em 0.9em 1.1em' }}>
            <motion.div className="relative w-full" initial={animate ? { opacity: 0, scale: 0.94 } : false} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.1 }}>
              {/* no sweep animation over the code itself: nothing should move across modules a camera is reading */}
              <QRCode value={url} snap className="w-full" />
            </motion.div>
          </div>
          <div className="grid content-center justify-items-center text-center" style={{ padding: '0.9em 1.2em 1.1em', gap: '0.25em' }}>
            <p className="text-ink-2" style={{ fontSize: '1em', lineHeight: 1.25 }}>
              Scan, or go to <strong className="font-semibold text-ink [overflow-wrap:anywhere]">{host}</strong> and enter
            </p>
            {pinDigits('3.9em')}
          </div>
        </div>
      </div>
    );
  }

  const big = variant === 'hero';
  return (
    // The perforation mask clips box-shadow, so the outline and shadow live on a wrapper (filter follows the cut-outs).
    <div className={className} data-appearance="light" style={{ filter: 'drop-shadow(0 0 0.7px rgb(22 27 51 / .55)) drop-shadow(0 0.9em 1.1em rgb(22 27 51 / .16))' }}>
    <div className="ticket" style={{ ['--stub' as string]: '34%', ...style }}>
      <div className="grid place-items-center" style={{ padding: big ? '1.1em' : '0.7em' }}>
        <motion.div className="relative w-full overflow-hidden rounded-[0.3em]" initial={animate ? { opacity: 0, scale: 0.9 } : false} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.1 }}>
          <QRCode value={url} className="block aspect-square w-full" />
          {variant === 'hero' && <ScanSweep />}
        </motion.div>
      </div>
      <div className="grid content-center" style={{ padding: big ? '1.5em 2em 1.5em 1.8em' : '0.8em 1.1em 0.8em 1em', gap: big ? '0.35em' : '0.15em' }}>
        <p className="text-ink-2" style={{ fontSize: big ? '1.05em' : '0.72em', lineHeight: 1.25 }}>
          {/* two fixed lines: letting the address sit inline made it wrap differently at different sizes */}
          <span className="block">Scan, or go to</span>
          <strong className="block font-semibold text-ink [overflow-wrap:anywhere]">{host}</strong>
        </p>
        {pinDigits(big ? '3.3em' : variant === 'card' ? '2.35em' : '2.3em')}
      </div>
    </div>
    </div>
  );
}
