import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** **bold** only; everything else is plain text. No HTML is ever interpreted. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i} className="font-bold">{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>));
}

/** Paragraphs separated by blank lines; lines starting with "- " become bullets. */
export function RichText({ text, className, bulletClassName }: { text: string; className?: string; bulletClassName?: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className={cn('grid gap-[0.7em]', className)}>
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        const isList = lines.every((l) => l.trimStart().startsWith('- '));
        if (isList) {
          return (
            <ul key={i} className={cn('grid gap-[0.45em]', bulletClassName)}>
              {lines.map((l, j) => (
                <li key={j} className="relative pl-[1.1em] before:absolute before:left-0 before:top-[0.62em] before:size-[0.38em] before:rounded-full before:bg-accent">{inline(l.trimStart().slice(2))}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{lines.flatMap((l, j) => (j === 0 ? [inline(l)] : [<br key={`b${j}`} />, inline(l)]))}</p>;
      })}
    </div>
  );
}
