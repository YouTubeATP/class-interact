import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, Check, GripVertical, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { swatch, type QuizView } from '@/render/viz/MatchOrder';

type Item = { id: string; text: string };

// ------------------------------------------------------------------------------------------------------
// Matching
// ------------------------------------------------------------------------------------------------------

function Chip({ item, tone = 'tray', selected, disabled, onClick, dragging }: { item: Item; tone?: 'tray' | 'placed'; selected?: boolean; disabled?: boolean; onClick?: () => void; dragging?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `chip:${item.id}`, disabled });
  return (
    <button
      ref={setNodeRef}
      type="button"
      data-testid="match-chip"
      disabled={disabled}
      onClick={onClick}
      {...attributes}
      {...listeners}
      aria-pressed={selected}
      className={cn(
        'min-h-11 rounded-xl border-2 bg-surface px-3.5 py-2 text-left text-[1rem] font-semibold leading-snug transition-[border-color,box-shadow,opacity] [touch-action:manipulation]',
        selected ? 'border-accent bg-accent-soft shadow-[0_0_0_3px_var(--accent-soft)]' : 'border-line-2',
        tone === 'placed' && 'w-full border-transparent bg-transparent px-1 py-1',
        (isDragging || dragging) && 'opacity-30',
      )}
    >
      {item.text}
    </button>
  );
}

function Slot({ id, children, onClick, disabled, label, state }: { id: string; children?: React.ReactNode; onClick: () => void; disabled?: boolean; label: string; state?: 'right' | 'wrong' }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${id}` });
  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      data-testid="match-slot"
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={cn(
        'flex min-h-12 min-w-0 items-center rounded-xl border-2 px-1.5 transition-colors',
        children ? 'border-solid bg-surface' : 'border-dashed bg-surface/60 text-ink-3',
        state === 'right' ? 'border-ok bg-ok-soft' : state === 'wrong' ? 'border-bad bg-bad-soft' : isOver ? 'border-accent bg-accent-soft' : children ? 'border-line-2' : 'border-line-2',
        !disabled && 'cursor-pointer',
      )}
    >
      {children ?? <span className="px-1.5 text-[0.8125rem] font-semibold">Tap or drop here</span>}
    </div>
  );
}

/** Where unplaced answers wait; dropping a chip here takes it back out of a slot. */
function Tray({ hint, children }: { hint: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'tray' });
  return (
    <div ref={setNodeRef} className={cn('grid gap-2 rounded-2xl border-2 border-dashed p-2.5 transition-colors', isOver ? 'border-accent bg-accent-soft' : 'border-line-2')} data-testid="match-tray">
      <p className="px-1 text-[0.8125rem] font-semibold text-ink-3">{hint}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/**
 * Phone UI for matching. Two ways to do the same thing, so it works with a finger, a mouse or a keyboard:
 * tap an answer, then tap the item it belongs to; or drag the answer onto the item.
 */
export function MatchPlay({ view, value, onChange, locked, answerMap }: { view: QuizView; value: Record<string, string>; onChange: (v: Record<string, string>) => void; locked: boolean; answerMap?: Record<string, string> }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const text = (id: string) => view.rights.find((r) => r.id === id)?.text ?? id;
  const placed = new Set(Object.values(value));
  const tray = view.rights.filter((r) => !placed.has(r.id));

  const assign = (left: string, right: string) => {
    const next = { ...value };
    for (const k of Object.keys(next)) if (next[k] === right) delete next[k];
    next[left] = right;
    onChange(next);
  };
  const clear = (left: string) => {
    const next = { ...value };
    delete next[left];
    onChange(next);
  };
  const onSlot = (left: string) => {
    if (locked) return;
    if (picked) { assign(left, picked); setPicked(null); }
    else if (value[left]) clear(left);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const chip = String(e.active.id).replace(/^chip:/, '');
    const over = e.over ? String(e.over.id) : '';
    if (over.startsWith('slot:')) { assign(over.slice(5), chip); setPicked(null); }
    else if (over === 'tray') {
      const from = Object.keys(value).find((k) => value[k] === chip);
      if (from) clear(from);
    }
  };
  const onDragStart = (e: DragStartEvent) => setDragging(String(e.active.id).replace(/^chip:/, ''));
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
      <div className="grid gap-3.5" data-testid="match-board">
        <ul className="grid gap-2.5" aria-label="Items to match">
          {view.lefts.map((l, i) => {
            const chosen = value[l.id];
            const state = answerMap ? (chosen === answerMap[l.id] ? 'right' : 'wrong') : undefined;
            const correctText = answerMap && state === 'wrong' ? text(answerMap[l.id]) : null;
            return (
              <motion.li key={l.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, type: 'spring', stiffness: 300, damping: 26 }} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-center gap-2.5">
                <span className="min-h-12 rounded-xl px-3 py-2.5 text-[1rem] font-bold leading-snug" style={{ background: swatch(i).bg, color: swatch(i).ink }}>{l.text}</span>
                <div className="grid gap-1">
                  <Slot id={l.id} label={`Answer for ${l.text}${chosen ? `: ${text(chosen)}` : ''}`} onClick={() => onSlot(l.id)} disabled={locked} state={state}>
                    {chosen && <Chip item={{ id: chosen, text: text(chosen) }} tone="placed" disabled={locked} dragging={dragging === chosen} />}
                  </Slot>
                  {correctText && <span className="px-1 text-[0.8125rem] font-semibold text-ok" data-testid="match-correct">Answer: {correctText}</span>}
                </div>
              </motion.li>
            );
          })}
        </ul>
        {!locked && (
          <Tray hint={tray.length ? 'Answers: tap one, then tap where it goes (or drag it)' : 'All matched. Tap a placed answer to take it back.'}>
            {tray.map((r) => <Chip key={r.id} item={r} selected={picked === r.id} dragging={dragging === r.id} onClick={() => setPicked((cur) => (cur === r.id ? null : r.id))} />)}
          </Tray>
        )}
      </div>
      <DragOverlay>{dragging ? <div className="rounded-xl border-2 border-accent bg-surface px-3.5 py-2 text-[1rem] font-semibold shadow-xl">{text(dragging)}</div> : null}</DragOverlay>
    </DndContext>
  );
}

// ------------------------------------------------------------------------------------------------------
// Ordering
// ------------------------------------------------------------------------------------------------------

function SortableRow({ item, index, last, locked, state, onMove }: { item: Item; index: number; last: boolean; locked: boolean; state?: 'right' | 'wrong'; onMove: (d: -1 | 1) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: locked });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn('relative', isDragging && 'z-20')} data-testid="order-row">
      <div className={cn('flex items-center gap-2 rounded-2xl border-2 bg-surface py-2 pl-1.5 pr-1.5', state === 'right' ? 'border-ok bg-ok-soft' : state === 'wrong' ? 'border-bad bg-bad-soft' : 'border-line-2', isDragging && 'shadow-xl')}>
        {locked ? (
          <span className={cn('tabular grid size-8 shrink-0 place-items-center rounded-full text-sm font-extrabold text-white', state === 'right' ? 'bg-ok' : state === 'wrong' ? 'bg-bad' : 'bg-ink-3')}>{state === 'right' ? <Check className="size-4" strokeWidth={3.2} /> : state === 'wrong' ? <X className="size-4" strokeWidth={3.2} /> : index + 1}</span>
        ) : (
          <button type="button" aria-label={`Drag ${item.text}. Or use the arrow buttons.`} className="grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-ink-3 active:cursor-grabbing" {...attributes} {...listeners}>
            <GripVertical className="size-5" />
          </button>
        )}
        <span className="min-w-0 flex-1 text-[1.0625rem] font-semibold leading-snug">{item.text}</span>
        {!locked && (
          <span className="flex shrink-0 gap-1">
            <button type="button" aria-label={`Move ${item.text} up`} disabled={index === 0} onClick={() => onMove(-1)} className="grid size-9 place-items-center rounded-lg bg-ink/6 disabled:opacity-30"><ArrowUp className="size-4" /></button>
            <button type="button" aria-label={`Move ${item.text} down`} disabled={last} onClick={() => onMove(1)} className="grid size-9 place-items-center rounded-lg bg-ink/6 disabled:opacity-30"><ArrowDown className="size-4" /></button>
          </span>
        )}
      </div>
    </li>
  );
}

/** Phone UI for ordering: drag by the handle, or use the arrow buttons. After the reveal each row shows if it was in the right place. */
export function OrderPlay({ view, value, onChange, locked, answerOrder }: { view: QuizView; value: string[]; onChange: (v: string[]) => void; locked: boolean; answerOrder?: string[] }) {
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const byId = new Map(view.items.map((i) => [i.id, i]));
  const rows = value.map((id) => byId.get(id)).filter(Boolean) as Item[];
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j >= 0 && j < value.length) onChange(arrayMove(value, i, j)); };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = value.indexOf(String(e.active.id));
    const to = value.indexOf(String(e.over.id));
    if (from >= 0 && to >= 0) onChange(arrayMove(value, from, to));
  };
  return (
    <div className="grid gap-3" data-testid="order-board">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={value} strategy={verticalListSortingStrategy}>
          <ol className="grid gap-2.5" aria-label="Put these in order, first at the top">
            {rows.map((it, i) => (
              <SortableRow key={it.id} item={it} index={i} last={i === rows.length - 1} locked={locked} state={answerOrder ? (answerOrder[i] === it.id ? 'right' : 'wrong') : undefined} onMove={(d) => move(i, d)} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      {answerOrder && rows.some((it, i) => answerOrder[i] !== it.id) && (
        <div className="rounded-2xl bg-ok-soft px-4 py-3 text-[0.9375rem] font-semibold text-[#0b4a30]" data-testid="order-correct">
          Right order: {answerOrder.map((id) => byId.get(id)?.text).join(' › ')}
        </div>
      )}
    </div>
  );
}
