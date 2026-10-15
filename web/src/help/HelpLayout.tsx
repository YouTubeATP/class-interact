import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SiteFooter } from '@/components/Footer';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { HelpSection } from './parts';

export type HelpVariant = 'participants' | 'presenters';

const VARIANTS: { id: HelpVariant; label: string; to: string }[] = [
  { id: 'participants', label: 'For participants', to: '/help' },
  { id: 'presenters', label: 'For presenters', to: '/studio/help' },
];

/** The same page shape for both audiences: a header, a switch between the two guides, a table of contents and the sections. */
export function HelpLayout({ variant, header, title, intro, sections, actions }: { variant: HelpVariant; /** Studio header for presenters; omitted for participants */ header?: ReactNode; title: string; intro: ReactNode; sections: HelpSection[]; actions?: ReactNode }) {
  const [current, setCurrent] = useState(sections[0]?.id ?? '');

  // highlight the section being read
  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e);
    if (!('IntersectionObserver' in window) || els.length === 0) return;
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setCurrent(visible.target.id);
    }, { rootMargin: '-80px 0px -60% 0px' });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [sections]);

  return (
    <div data-palette="azure" className="flex min-h-dvh flex-col bg-paper" data-testid={`help-${variant}`}>
      {header ?? (
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-line bg-paper/90 px-4 backdrop-blur sm:px-6">
          <Link to="/" className="rounded-lg" aria-label="ClassInteract home"><Logo /></Link>
          <Button asChild variant="primary" size="sm"><Link to="/join" data-testid="help-join">Join a session</Link></Button>
        </header>
      )}

      <main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-[minmax(0,1fr)] content-start gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12 lg:py-12">
        <div className="grid content-start gap-5 lg:col-span-2 lg:max-w-3xl">
          <div className="grid gap-3">
            <h1 className="display text-[2.4rem]" data-testid="help-title">{title}</h1>
            <div className="text-[1.0625rem] leading-relaxed text-ink-2">{intro}</div>
          </div>
          <nav className="flex w-fit max-w-full rounded-xl bg-ink/6 p-1" aria-label="Help for">
            {VARIANTS.map((v) => (
              <Link key={v.id} to={v.to} aria-current={v.id === variant ? 'page' : undefined} data-testid={`help-switch-${v.id}`}
                className={cn('rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors pointer-coarse:min-h-11 pointer-coarse:content-center', v.id === variant ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink')}>
                {v.label}
              </Link>
            ))}
          </nav>
          {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
        </div>

        <nav aria-label="On this page" className="lg:sticky lg:top-20 lg:self-start" data-testid="help-toc">
          <p className="mb-2 hidden text-xs font-bold uppercase tracking-wide text-ink-3 lg:block">On this page</p>
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0">
            {sections.map((s) => (
              <li key={s.id} className="shrink-0">
                <a href={`#${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ block: 'start' }); history.replaceState(null, '', `#${s.id}`); setCurrent(s.id); }}
                  aria-current={current === s.id ? 'location' : undefined}
                  className={cn('block whitespace-nowrap rounded-full border px-3 py-2 text-sm font-semibold transition-colors lg:rounded-lg lg:border-transparent lg:py-1.5', current === s.id ? 'border-accent/30 bg-accent-soft text-accent-ink' : 'border-line bg-surface text-ink-2 hover:text-ink lg:bg-transparent')}>
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="grid min-w-0 gap-12">
          {sections.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="grid scroll-mt-24 gap-4" data-testid="help-section">
              <h2 id={`${s.id}-h`} className="flex items-center gap-3 text-[1.5rem]">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink"><s.icon className="size-5" aria-hidden /></span>
                {s.title}
              </h2>
              {s.body}
            </section>
          ))}
        </div>
      </main>
      <SiteFooter className="pb-6 pt-2" help={false} />
    </div>
  );
}
