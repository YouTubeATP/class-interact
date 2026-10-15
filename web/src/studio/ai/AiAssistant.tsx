import { AssistantChatTransport, useAISDKError, useChatRuntime } from '@assistant-ui/ai-sdk';
import { AssistantRuntimeProvider, AuiConfig, ComposerPrimitive, MessagePrimitive, ThreadPrimitive, Tools, defineToolkit, useAui, useAuiState } from '@assistant-ui/react';
import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowUp, Check, Eye, FilePlus2, Loader2, MoveVertical, PencilLine, Palette, RotateCcw, Sparkles, Square, Trash2, Undo2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { AI_TOOLS, applyAiTool, type PresentationDoc } from '@classinteract/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { STUDIO_TOKEN_KEY, store } from '@/lib/storage';

export interface AiAssistantProps {
  /** The editor's live document. Tools read and write through this ref so several calls in one step never see stale data. */
  docRef: MutableRefObject<PresentationDoc | null>;
  /** Replace the document in the editor (it then validates and autosaves like any other edit). */
  applyDoc: (doc: PresentationDoc) => void;
  /** Bring a slide the assistant just made into view. */
  focusSlide: (id: string) => void;
  onClose: () => void;
}

const SUGGESTIONS = [
  'Build a 6 slide lesson about the water cycle with a quiz and a poll',
  'Add a matching question that pairs countries with their capitals',
  'Make a short icebreaker: a word cloud and a rating',
  'Turn the last quiz into a select-all-that-apply question',
];

const TOOL_LABELS: Record<string, { running: string; done: string; failed: string; icon: typeof Eye }> = {
  get_presentation: { running: 'Reading the deck', done: 'Read the deck', failed: 'Could not read the deck', icon: Eye },
  set_presentation_info: { running: 'Updating title and theme', done: 'Updated title and theme', failed: 'Could not update the title or theme', icon: Palette },
  add_slides: { running: 'Adding slides', done: 'Added slides', failed: 'Could not add those slides', icon: FilePlus2 },
  update_slide: { running: 'Editing a slide', done: 'Edited a slide', failed: 'Could not edit that slide', icon: PencilLine },
  delete_slide: { running: 'Deleting a slide', done: 'Deleted a slide', failed: 'Could not delete that slide', icon: Trash2 },
  move_slide: { running: 'Moving a slide', done: 'Moved a slide', failed: 'Could not move that slide', icon: MoveVertical },
};

/** One line in the conversation for a tool the assistant used. */
function ToolCard(props: any) {
  const { toolName, args, result } = props as { toolName: string; args?: any; result?: any };
  const label = TOOL_LABELS[toolName] ?? { running: toolName, done: toolName, failed: toolName, icon: Sparkles };
  const Icon = label.icon;
  const running = result === undefined;
  const rejected = result && result.ok === false;
  let detail = '';
  if (!running && !rejected) {
    if (toolName === 'add_slides' && Array.isArray(result.added)) detail = `${result.added.length} ${result.added.length === 1 ? 'slide' : 'slides'}`;
    else if (toolName === 'update_slide') detail = String(args?.slide_id ?? '');
  }
  return (
    <div className={cn('my-1.5 flex items-start gap-2 rounded-xl px-3 py-2 text-[0.8125rem] font-semibold', rejected ? 'bg-warn-soft text-warn' : 'bg-ink/5 text-ink-2')} data-testid="ai-tool" data-tool={toolName} data-state={running ? 'running' : rejected ? 'rejected' : 'done'}>
      <span className="mt-0.5 grid size-4 shrink-0 place-items-center">
        {running ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : rejected ? <AlertTriangle className="size-3.5" aria-hidden /> : <Check className="size-3.5 text-ok" strokeWidth={3} aria-hidden />}
      </span>
      <span className="min-w-0">
        <span className="inline-flex items-center gap-1.5"><Icon className="size-3.5 opacity-70" aria-hidden /> {running ? label.running : rejected ? `${label.failed}, trying again` : label.done}{detail && <span className="font-medium opacity-70">: {detail}</span>}</span>
        {rejected && <span className="mt-0.5 block text-xs font-medium opacity-80">{String(result.issues?.[0] ?? result.error ?? '')}</span>}
      </span>
    </div>
  );
}

const Text = ({ text }: { text: string }) => <p className="whitespace-pre-wrap leading-relaxed">{text}</p>;

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end" data-testid="ai-user-message">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2.5 text-[0.9375rem] font-medium text-white">
        <MessagePrimitive.Parts components={{ Text }} />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex gap-2.5" data-testid="ai-assistant-message">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink"><Sparkles className="size-3.5" aria-hidden /></span>
      <div className="min-w-0 flex-1 text-[0.9375rem] text-ink">
        <MessagePrimitive.Parts components={{ Text, tools: { Fallback: ToolCard } }} />
      </div>
    </MessagePrimitive.Root>
  );
}

function friendlyError(error: Error | undefined): string | null {
  if (!error) return null;
  const m = error.message ?? '';
  try {
    const parsed = JSON.parse(m);
    if (parsed?.error?.message) return String(parsed.error.message);
  } catch { /* not JSON */ }
  return m.length > 0 && m.length < 220 ? m : 'Something went wrong. Try again.';
}

function ErrorBar() {
  const error = useAISDKError();
  const text = friendlyError(error);
  if (!text) return null;
  return <p className="mx-4 mb-2 rounded-xl bg-bad-soft px-3 py-2 text-[0.8125rem] font-semibold text-bad" role="alert" data-testid="ai-error">{text}</p>;
}

function Welcome() {
  const aui = useAui();
  return (
    <div className="grid gap-4 py-4" data-testid="ai-welcome">
      <div className="grid gap-1.5">
        <h3 className="text-[1.0625rem] font-bold">What should we build?</h3>
        <p className="text-sm text-ink-2">Describe a lesson or an activity and I will add the slides. You can keep asking me to change things.</p>
      </div>
      <div className="grid gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" onClick={() => aui.thread().append({ role: 'user', content: [{ type: 'text', text: s }] })} className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left text-[0.875rem] font-semibold text-ink-2 transition-colors hover:border-accent hover:text-ink">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Composer() {
  const running = useAuiState((s) => s.thread.isRunning);
  return (
    <ComposerPrimitive.Root className="flex items-end gap-2 border-t border-line bg-surface p-3">
      <ComposerPrimitive.Input rows={1} autoFocus placeholder="Ask for slides, quizzes, changes…" aria-label="Message the assistant" data-testid="ai-input" className="max-h-36 min-h-11 flex-1 resize-none rounded-xl border border-line-2 bg-paper px-3.5 py-2.5 text-[0.9375rem] outline-none focus:border-accent focus:ring-2 focus:ring-accent/25" />
      {running ? (
        <ComposerPrimitive.Cancel asChild><button type="button" aria-label="Stop" className="grid size-11 shrink-0 place-items-center rounded-xl bg-ink text-white" data-testid="ai-stop"><Square className="size-4 fill-current" aria-hidden /></button></ComposerPrimitive.Cancel>
      ) : (
        <ComposerPrimitive.Send asChild><button type="submit" aria-label="Send" className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-white disabled:opacity-40" data-testid="ai-send"><ArrowUp className="size-5" aria-hidden /></button></ComposerPrimitive.Send>
      )}
    </ComposerPrimitive.Root>
  );
}

/** Records which user message the assistant is answering, so every turn's edits can be undone as one step. */
function TurnTracker({ turnRef }: { turnRef: MutableRefObject<string> }) {
  const lastUser = useAuiState((s) => [...s.thread.messages].reverse().find((m) => m.role === 'user')?.id ?? '');
  useEffect(() => { turnRef.current = lastUser; }, [lastUser, turnRef]);
  return null;
}

function Chat({ docRef, applyDoc, focusSlide, onChanged }: Pick<AiAssistantProps, 'docRef' | 'applyDoc' | 'focusSlide'> & { onChanged: (before: PresentationDoc, turn: string) => void }) {
  const turnRef = useRef('');
  const snapped = useRef('');

  // The tools run here, in the browser, against the document being edited. The server only ever sees their results.
  const toolkit = useMemo(() => {
    const run = (name: string, args: unknown) => {
      const before = docRef.current;
      if (!before) return { ok: false, error: 'The presentation is not loaded yet.' };
      const out = applyAiTool(before, name, args);
      if (out.changed) {
        if (snapped.current !== turnRef.current) { snapped.current = turnRef.current; onChanged(before, turnRef.current); }
        docRef.current = out.doc;
        applyDoc(out.doc);
        const added = (out.result as any).added?.[0]?.slide_id ?? ((out.result as any).slide_id as string | undefined);
        if (added) focusSlide(added);
      }
      return out.result;
    };
    return defineToolkit(
      Object.fromEntries(
        AI_TOOLS.map((t) => [t.name, { type: 'frontend', description: t.description, parameters: t.parameters as any, execute: async (args: unknown) => run(t.name, args), render: ToolCard }]),
      ) as any,
    );
  }, [docRef, applyDoc, focusSlide, onChanged]);

  const transport = useMemo(
    () => new AssistantChatTransport({ api: '/api/studio/ai/chat', headers: (): Record<string, string> => { const t = store.get<string>(STUDIO_TOKEN_KEY); return t ? { Authorization: `Bearer ${t}` } : {}; } }),
    [],
  );
  const runtime = useChatRuntime({ transport, sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls });
  const config = useMemo(() => AuiConfig({ tools: Tools({ toolkit }) }), [toolkit]);

  return (
    <AssistantRuntimeProvider runtime={runtime} config={config}>
      <TurnTracker turnRef={turnRef} />
      <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
        <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto px-4 py-3" data-testid="ai-thread">
          <ThreadPrimitive.Empty><Welcome /></ThreadPrimitive.Empty>
          <div className="grid gap-4 pb-2">
            <ThreadPrimitive.Messages>
              {({ message }) => (message.role === 'user' ? <UserMessage /> : <AssistantMessage />)}
            </ThreadPrimitive.Messages>
          </div>
        </ThreadPrimitive.Viewport>
        <ErrorBar />
        <Composer />
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

/** The AI chat panel in the editor. Loaded on demand, so it costs nothing until someone opens it. */
export default function AiAssistant({ docRef, applyDoc, focusSlide, onClose }: AiAssistantProps) {
  const [chatKey, setChatKey] = useState(0);
  const [undoStack, setUndoStack] = useState<{ turn: string; doc: PresentationDoc }[]>([]);
  const onChanged = useMemo(() => (doc: PresentationDoc, turn: string) => setUndoStack((s) => [...s, { turn, doc }]), []);

  const undo = () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    docRef.current = last.doc;
    applyDoc(last.doc);
    setUndoStack((s) => s.slice(0, -1));
  };

  return (
    <motion.section
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[26rem] flex-col border-l border-line bg-surface shadow-[-12px_0_40px_-20px_rgba(15,20,40,0.35)]"
      aria-label="AI assistant"
      data-testid="ai-panel"
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="grid size-8 place-items-center rounded-xl bg-accent-soft text-accent-ink"><Sparkles className="size-4" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[0.9375rem] font-bold leading-tight">AI assistant</h2>
          <p className="truncate text-xs text-ink-3">Builds and edits this presentation</p>
        </div>
        <AnimatePresence>
          {undoStack.length > 0 && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
              <Button variant="secondary" size="sm" onClick={undo} data-testid="ai-undo"><Undo2 className="size-3.5" aria-hidden /> Undo AI changes</Button>
            </motion.div>
          )}
        </AnimatePresence>
        <Button variant="ghost" size="icon-sm" aria-label="Start a new chat" title="New chat" onClick={() => setChatKey((k) => k + 1)} data-testid="ai-new-chat"><RotateCcw className="size-4" /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Close the assistant" onClick={onClose} data-testid="ai-close"><X className="size-4" /></Button>
      </header>
      <Chat key={chatKey} docRef={docRef} applyDoc={applyDoc} focusSlide={focusSlide} onChanged={onChanged} />
    </motion.section>
  );
}
