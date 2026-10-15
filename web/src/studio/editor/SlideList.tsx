import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Copy, GripVertical, MoreVertical, Plus, Settings2, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { definitions, INTERACTIVE_TYPES, type Slide, type SlideType } from '@classinteract/shared';
import { typeMeta } from '@/activities/meta';
import { Button } from '@/components/ui/button';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/dropdown';
import { cn } from '@/lib/cn';

const titleOf = (s: Slide) => {
  const { id: _id, type, ...config } = s;
  return (definitions[type] as any).titleOf(config) as string;
};

function Row({ slide, index, selected, hasIssues, onSelect, onDuplicate, onDelete }: { slide: Slide; index: number; selected: boolean; hasIssues: boolean; onSelect: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id });
  const m = typeMeta[slide.type];
  const timer = 'timeLimitSec' in slide && slide.timeLimitSec ? `${slide.timeLimitSec}s` : null;
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn('relative', isDragging && 'z-20')} data-testid="slide-row">
      <div data-tone={slide.type} className={cn('group flex items-center gap-1.5 rounded-2xl border bg-surface py-1.5 pl-1 pr-1.5 transition-[border-color,box-shadow]', selected ? 'border-accent shadow-[0_0_0_3px_var(--accent-soft)]' : 'border-line hover:border-line-2', isDragging && 'shadow-xl')}>
        <button type="button" className="grid h-9 w-6 shrink-0 cursor-grab touch-none place-items-center pointer-coarse:h-11 pointer-coarse:w-9 text-ink-3 hover:text-ink active:cursor-grabbing" aria-label={`Reorder slide ${index + 1}. Press space, then use arrow keys.`} {...attributes} {...listeners}>
          <GripVertical className="size-4" />
        </button>
        <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl py-1 text-left" aria-current={selected} data-testid="slide-select">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-tone text-tone-ink"><m.icon className="size-[1.1rem]" aria-label={m.label} /></span>
          <span className="grid min-w-0">
            <span className="truncate text-[0.8125rem] font-bold leading-tight">{titleOf(slide) || <em className="font-medium text-ink-3">Untitled</em>}</span>
            <span className="flex items-center gap-1.5 text-xs text-ink-3"><span className="tabular">{index + 1}</span> {m.short}{timer && <span className="rounded bg-ink/6 px-1 font-semibold">{timer}</span>}</span>
          </span>
        </button>
        {hasIssues && <span className="size-2 shrink-0 rounded-full bg-bad" role="img" aria-label="This slide has problems" />}
        <Menu>
          <MenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for slide ${index + 1}`}><MoreVertical className="size-4" /></Button></MenuTrigger>
          <MenuContent>
            <MenuItem icon={<Copy className="size-4" />} onSelect={onDuplicate}>Duplicate</MenuItem>
            <MenuSeparator />
            <MenuItem danger icon={<Trash2 className="size-4" />} onSelect={onDelete}>Delete</MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </li>
  );
}

export function SlideList({ slides, selected, issueIndexes, onSelect, onReorder, onAdd, onDuplicate, onDelete }: {
  slides: Slide[]; selected: string; issueIndexes: Set<number>; onSelect: (id: string) => void; onReorder: (slides: Slide[]) => void; onAdd: (t: SlideType) => void; onDuplicate: (id: string) => void; onDelete: (id: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = slides.findIndex((s) => s.id === active.id);
    const to = slides.findIndex((s) => s.id === over.id);
    if (from >= 0 && to >= 0) onReorder(arrayMove(slides, from, to));
  };
  return (
    <div className="grid content-start gap-3">
      <button type="button" onClick={() => onSelect('settings')} className={cn('flex items-center gap-2.5 rounded-2xl border bg-surface px-3 py-2.5 text-left text-[0.8125rem] font-bold transition-colors', selected === 'settings' ? 'border-accent shadow-[0_0_0_3px_var(--accent-soft)]' : 'border-line hover:border-line-2')} data-testid="settings-select">
        <span className="grid size-9 place-items-center rounded-xl bg-ink/6 text-ink-2"><Settings2 className="size-[1.1rem]" aria-hidden /></span> Presentation settings
      </button>
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[0.8125rem] font-bold text-ink-2">Slides <span className="tabular font-semibold text-ink-3">({slides.length})</span></h2>
        <Menu>
          <MenuTrigger asChild><Button variant="soft" size="sm" data-testid="add-slide"><Plus className="size-3.5" aria-hidden /> Add</Button></MenuTrigger>
          <MenuContent className="w-72">
            <MenuItem onSelect={() => onAdd('content')} data-testid="add-content"><TypeItem type="content" /></MenuItem>
            <MenuSeparator />
            {INTERACTIVE_TYPES.map((t) => <MenuItem key={t} onSelect={() => onAdd(t)} data-testid={`add-${t}`}><TypeItem type={t} /></MenuItem>)}
          </MenuContent>
        </Menu>
      </div>
      {slides.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-2 px-4 py-8 text-center text-sm text-ink-3">No slides yet. Use <strong>Add</strong> to create a content slide or an activity.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={slides.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <ol className="grid gap-2">
              <AnimatePresence initial={false}>
                {slides.map((s, i) => (
                  <motion.div key={s.id} layout="position" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ type: 'spring', stiffness: 400, damping: 32 }}>
                    <Row slide={s} index={i} selected={selected === s.id} hasIssues={issueIndexes.has(i)} onSelect={() => onSelect(s.id)} onDuplicate={() => onDuplicate(s.id)} onDelete={() => onDelete(s.id)} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </ol>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function TypeItem({ type }: { type: SlideType }) {
  const m = typeMeta[type];
  return (
    <span data-tone={type} className="flex items-start gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-tone text-tone-ink"><m.icon className="size-4" aria-hidden /></span>
      <span className="grid"><span className="font-semibold">{m.label}</span><span className="text-xs text-ink-3">{m.description}</span></span>
    </span>
  );
}
