import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';

const linkClass = 'font-semibold text-ink-2 underline decoration-line-2 underline-offset-2 transition-colors hover:text-accent hover:decoration-accent';

/**
 * Credit line (and a way to the help pages) for the pages people land on: home and the Studio.
 * Left off the projector and phone activity screens on purpose.
 */
export function SiteFooter({ className, help = '/help' }: { className?: string; /** Where "Help" goes; false hides it */ help?: string | false }) {
  return (
    <footer className={cn('text-center text-[0.8125rem] font-medium text-ink-3', className)} data-testid="site-footer">
      {help && <><Link to={help} className={linkClass} data-testid="footer-help">Help</Link><span aria-hidden> · </span></>}
      Built with <span role="img" aria-label="love">❤️</span> by{' '}
      <a href="https://ansonwph.me" target="_blank" rel="noreferrer noopener" className={linkClass}>AnsonWPH</a>
    </footer>
  );
}
