import { useEffect, useState } from 'react';
import type { ClientConfig } from '@classinteract/shared';
import { api } from './api';

const isLocal = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '::1';

/**
 * The address participants should open. Priority: PUBLIC_URL from the server (domain / Cloudflare Tunnel),
 * then the current origin, and — when the studio runs on localhost — the machine's LAN address so phones can reach it.
 */
export function joinBase(cfg: ClientConfig | null): { base: string; localhostWarning: boolean } {
  if (cfg?.publicUrl) return { base: cfg.publicUrl, localhostWarning: false };
  const { origin, hostname, port, protocol } = window.location;
  if (isLocal(hostname) && cfg?.lanUrls.length) {
    const lan = new URL(cfg.lanUrls[0]);
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
  const { base, localhostWarning } = joinBase(cfg);
  return { url: pin ? joinUrl(base, pin) : '', host: displayHost(base), base, localhostWarning, ready: !!cfg };
}
