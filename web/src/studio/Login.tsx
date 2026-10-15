import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api';
import { useClientConfig } from '@/lib/joinUrl';
import { STUDIO_TOKEN_KEY, store } from '@/lib/storage';

export default function LoginPage() {
  const cfg = useClientConfig();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = params.get('next');
  const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/studio';

  if (cfg && !cfg.authRequired) return <Navigate to={dest} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token } = await api.login(password);
      store.set(STUDIO_TOKEN_KEY, token);
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-palette="azure" className="mx-auto grid min-h-dvh max-w-sm content-center gap-7 px-5">
      <Logo />
      <form onSubmit={submit} className="grid gap-5">
        <div className="grid gap-1.5">
          <h1 className="display text-[2rem]">Presenter Studio</h1>
          <p className="text-ink-2">Enter the studio password to create presentations and run sessions. Participants never need it.</p>
        </div>
        <Field label="Password" error={error} htmlFor="pw">
          <Input id="pw" type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!error} data-testid="studio-password" />
        </Field>
        <Button type="submit" variant="primary" size="lg" disabled={busy || !password} data-testid="studio-login">{busy && <Loader2 className="size-4 animate-spin" aria-hidden />} Sign in</Button>
      </form>
    </div>
  );
}
