import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { store } from './storage';

/**
 * Light / dark / system appearance. Presenters (the Studio, dashboard, remote) and participants (join page, phone)
 * keep separate preferences, even on the same device. The projector has none: its look is chosen by the presenter
 * per session and never follows the projector computer's operating system.
 *
 * /theme-init.js applies the saved choice before the first paint; this module keeps it in sync afterwards.
 */
export type AppearancePref = 'system' | 'light' | 'dark';
export type AppearanceScope = 'studio' | 'participant' | 'projector';

const key = (scope: AppearanceScope) => `ci:appearance:${scope}`;
const EVENT = 'ci:appearance';

export function scopeForPath(path: string): AppearanceScope {
  if (/^\/project(\/|$)/.test(path)) return 'projector';
  if (/^\/(studio|session|results|remote|login|learners|settings)(\/|$)/.test(path)) return 'studio';
  return 'participant';
}

const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

export function readPref(scope: AppearanceScope): AppearancePref {
  const v = store.get<string>(key(scope));
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function resolve(pref: AppearancePref): 'light' | 'dark' {
  return pref === 'system' ? (media()?.matches ? 'dark' : 'light') : pref;
}

/** Put the page in light or dark (without a reload). */
export function applyAppearance(scope: AppearanceScope) {
  const root = document.documentElement;
  root.setAttribute('data-scope', scope);
  const mode = scope === 'projector' ? 'light' : resolve(readPref(scope));
  root.setAttribute('data-theme', mode);
  root.style.background = scope === 'projector' ? '#0d1124' : mode === 'dark' ? '#0f1222' : '#f5f6fa';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#0f1222' : '#f5f6fa');
}

export function setPref(scope: AppearanceScope, pref: AppearancePref) {
  if (pref === 'system') store.remove(key(scope));
  else store.set(key(scope), pref);
  window.dispatchEvent(new Event(EVENT));
}

/** Keeps the page in step with the current route's scope, the saved choice and the OS setting. */
export function useAppearanceSync(path: string) {
  const scope = scopeForPath(path);
  useEffect(() => {
    applyAppearance(scope);
    const on = () => applyAppearance(scope);
    const m = media();
    m?.addEventListener('change', on);
    window.addEventListener(EVENT, on);
    window.addEventListener('storage', on);
    return () => {
      m?.removeEventListener('change', on);
      window.removeEventListener(EVENT, on);
      window.removeEventListener('storage', on);
    };
  }, [scope]);
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  const m = media();
  m?.addEventListener('change', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
    m?.removeEventListener('change', cb);
  };
}

export function useAppearance(scope: AppearanceScope) {
  const pref = useSyncExternalStore(subscribe, () => readPref(scope), () => 'system' as AppearancePref);
  const resolved = useSyncExternalStore(subscribe, () => resolve(readPref(scope)), () => 'light' as const);
  const set = useCallback((p: AppearancePref) => setPref(scope, p), [scope]);
  return { pref, resolved, set };
}
