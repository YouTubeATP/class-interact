import { useEffect, useState } from 'react';
import type { ClientConfig } from '@classinteract/shared';
import { api } from './api';
import { store } from './storage';

const isLocal = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '::1';

/**
 * The address participants should open. Priority: PUBLIC_URL from the server (domain / Cloudflare Tunnel),
 * then the current origin, and — when the studio runs on localhost — the machine's LAN address so phones can reach it.
 */
const LAN_CHOICE_KEY = 'ci:lan-host';
const LAN_EVENT = 'ci:lan-host-changed';

/** The presenter can pick which of this computer's network addresses phones should use (when it has several). */
export function chooseLanHost(host: string) {
  store.set(LAN_CHOICE_KEY, host);
  window.dispatchEvent(new Event(LAN_EVENT));
}

export function joinBase(cfg: ClientConfig | null): { base: string; localhostWarning: boolean } {
  if (cfg?.publicUrl) return { base: cfg.publicUrl, localhostWarning: false };
  const { origin, hostname, port, protocol } = window.location;
  if (isLocal(hostname) && cfg?.lanUrls.length) {
    const hosts = cfg.lanUrls.map((u) => new URL(u).hostname);
    const chosen = store.get<string>(LAN_CHOICE_KEY);
    const lan = new URL(`http://${chosen && hosts.includes(chosen) ? chosen : hosts[0]}`);
    return { base: `${protocol}//${lan.hostname}${port ? `:${port}` : ''}`, localhostWarning: false };
  }
  return { base: origin, localhostWarning: isLocal(hostname) };
}

export const joinUrl = (base: string, pin: string) => `${base}/join/${pin}`;
export const prettyPin = (pin: string) => `${pin.slice(0, 3)} ${pin.slice(3)}`;
export const displayHost = (base: string) => base.replace(/^https?:\/\//, '');

let cached: Promise<ClientConfig> | null = null;
export const loadConfig = () => (cached ??= api.config().catch((e) => { cached = null; throw e; }));

export function useClientConfig(): ClientConfig | null {
  const [cfg, setCfg] = useState<ClientConfig | null>(null);
  useEffect(() => {
    let live = true;
    loadConfig().then((c) => live && setCfg(c)).catch(() => undefined);
    return () => { live = false; };
  }, []);
  return cfg;
}

export function useJoinInfo(pin: string | undefined) {
  const cfg = useClientConfig();
  const [, bump] = useState(0);
  useEffect(() => {
    const on = () => bump((n) => n + 1);
    window.addEventListener(LAN_EVENT, on);
    return () => window.removeEventListener(LAN_EVENT, on);
  }, []);
  const { base, localhostWarning } = joinBase(cfg);
  // other addresses this computer answers on, offered when phones cannot reach the first guess
  const onLocalhost = isLocal(window.location.hostname) && !cfg?.publicUrl;
  const alternatives = onLocalhost && cfg ? cfg.lanUrls.map((u) => new URL(u).hostname) : [];
  return { url: pin ? joinUrl(base, pin) : '', host: displayHost(base), base, localhostWarning, ready: !!cfg, alternatives };
}
