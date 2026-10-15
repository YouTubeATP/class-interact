import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Loader2, ScanLine } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AmbientBackdrop, BreathingGlow } from '@/components/Ambient';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api';
import { credentialForPin, lastName, rememberName, saveCredential } from '@/lib/storage';
import { prettyPin } from '@/lib/joinUrl';

// The scanner (and its decoder) is only downloaded when someone taps Scan, keeping the page people land on after
// scanning the projector's QR code as light as possible.
const QrScanner = lazy(() => import('@/components/QrScanner').then((m) => ({ default: m.QrScanner })));

type Step = { kind: 'pin' } | { kind: 'name'; pin: string; title: string } | { kind: 'working' };

/** Landing page and join flow in one: enter the code, pick a name (if the session asks), go. */
export default function JoinPage() {
  const params = useParams();
  const navigate = useNavigate();
  const [pin, setPin] = useState((params.pin ?? '').replace(/\D/g, '').slice(0, 6));
  const [name, setName] = useState(lastName);
  const [step, setStep] = useState<Step>(params.pin ? { kind: 'working' } : { kind: 'pin' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ran = useRef(false);
  const [scanning, setScanning] = useState(false);

  async function joinWith(p: string, nm?: string) {
    const stored = credentialForPin(p);
    try {
      const res = await api.join({ pin: p, name: nm, token: stored?.token });
      saveCredential(p, { sessionId: res.sessionId, participantId: res.participantId, token: res.token, name: res.name });
      rememberName(res.name);
      navigate(`/play/${res.sessionId}`, { replace: true });
    } catch (e) {
      throw e;
    }
  }

  async function lookup(p: string) {
    setError(null);
    setBusy(true);
    try {
      const info = await api.lookup(p);
      if (info.status === 'ended') {
        setError('That session has already ended.');
        setStep({ kind: 'pin' });
        return;
      }
      // Returning on the same device? Resume silently without asking for a name again.
      if (credentialForPin(p)) {
        try { await joinWith(p); return; } catch { /* stale token: continue as a new participant */ }
      }
      if (info.collectNames) setStep({ kind: 'name', pin: p, title: info.title });
      else await joinWith(p);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
      setStep({ kind: 'pin' });
    } finally {
      setBusy(false);
    }
  }

  // a successful scan fills in the code and carries straight on, exactly like opening the QR link
  const onScanned = useCallback((code: string) => {
    setScanning(false);
    setPin(code);
    void lookup(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (params.pin && !ran.current && /^\d{6}$/.test(params.pin)) {
      ran.current = true;
      void lookup(params.pin);
    } else if (params.pin) {
      setError('That code is not 6 digits.');
      setStep({ kind: 'pin' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPin = (e: FormEvent) => {
    e.preventDefault();
    if (pin.length !== 6) return setError('Enter the 6-digit code from the screen.');
    void lookup(pin);
  };

  const onName = async (e: FormEvent) => {
    e.preventDefault();
    if (step.kind !== 'name') return;
    setError(null);
    setBusy(true);
    try {
      await joinWith(step.pin, name);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not join. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-palette="azure" className="relative mx-auto grid min-h-dvh max-w-md content-center gap-8 px-5 py-10">
      <AmbientBackdrop />
      <header className="flex items-center justify-between">
        <Logo />
        <Link to="/studio" className="rounded-full px-3 py-1.5 text-sm font-semibold text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink">Presenter Studio</Link>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        {step.kind === 'working' && (
          <motion.div key="working" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid justify-items-center gap-3 py-16 text-ink-2">
            <Loader2 className="size-7 animate-spin" aria-hidden /> <p className="font-semibold">Joining session…</p>
          </motion.div>
        )}

        {step.kind === 'pin' && (
          <motion.form key="pin" noValidate onSubmit={onPin} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="grid gap-6">
            <div className="grid gap-2">
              <h1 className="display text-[2.6rem]">Join a session</h1>
              <p className="text-[1.0625rem] text-ink-2">Enter the code on the screen, or scan the QR code with your camera.</p>
            </div>
            <Field error={error}>
              <div className="relative">
                <BreathingGlow className="inset-x-2 inset-y-1 rounded-3xl" from={0.2} to={0.55} duration={4.5} />
              <Input
                autoFocus
                inputMode="numeric"
                autoComplete="off"
                aria-label="Session code"
                placeholder="123 456"
                value={pin.length > 3 ? prettyPin(pin) : pin}
                onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null); }}
                aria-invalid={!!error}
                data-testid="pin-input"
                className="tabular relative h-16 rounded-2xl text-center text-[2rem] font-extrabold tracking-[0.12em] placeholder:font-semibold placeholder:tracking-normal"
              />
              </div>
            </Field>
            <Button type="submit" variant="primary" size="xl" disabled={busy || pin.length !== 6} data-testid="pin-submit">
              {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null} Continue <ArrowRight className="size-5" aria-hidden />
            </Button>
            <div className="flex items-center gap-3 text-sm font-semibold text-ink-3" aria-hidden><span className="h-px flex-1 bg-line-2" />or<span className="h-px flex-1 bg-line-2" /></div>
            <Button variant="secondary" size="xl" onClick={() => setScanning(true)} data-testid="scan-open"><ScanLine className="size-5" aria-hidden /> Scan QR code</Button>
          </motion.form>
        )}

        {step.kind === 'name' && (
          <motion.form key="name" noValidate onSubmit={onName} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="grid gap-6">
            <div className="grid gap-2">
              <p className="text-sm font-semibold text-ink-3">{step.title}</p>
              <h1 className="display text-[2.6rem]">What should we call you?</h1>
              <p className="text-[1.0625rem] text-ink-2">Pick a display name. No account needed.</p>
            </div>
            <Field error={error}>
              <Input autoFocus onFocus={(e) => e.currentTarget.select()} value={name} onChange={(e) => { setName(e.target.value); setError(null); }} maxLength={24} autoComplete="nickname" aria-label="Your name" placeholder="Your name" aria-invalid={!!error} data-testid="name-input" className="h-16 rounded-2xl text-center text-[1.5rem] font-bold" />
            </Field>
            <Button type="submit" variant="primary" size="xl" disabled={busy || !name.trim()} data-testid="name-submit">
              {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null} Join session
            </Button>
            <button type="button" className="text-sm font-semibold text-ink-3 hover:text-ink" onClick={() => { setStep({ kind: 'pin' }); setError(null); }}>Use a different code</button>
          </motion.form>
        )}
      </AnimatePresence>
      {scanning && <Suspense fallback={null}><QrScanner open onClose={() => setScanning(false)} onCode={onScanned} /></Suspense>}
    </div>
  );
}
