import { describe, expect, it } from 'vitest';
import type { ClientConfig } from '@classinteract/shared';
import { joinBase } from './joinUrl';

const cfg = (over: Partial<ClientConfig> = {}): ClientConfig => ({
  publicUrl: null,
  lanUrls: ['http://192.168.50.200:3001', 'http://10.134.240.59:3001'], // best guess first
  authRequired: false,
  aiEnabled: false,
  version: 'test',
  ...over,
});

function openedAt(url: string) {
  const u = new URL(url);
  Object.defineProperty(window, 'location', { value: { origin: u.origin, hostname: u.hostname, port: u.port, protocol: u.protocol }, configurable: true });
}

describe('which address the QR code uses', () => {
  it('uses the best LAN guess when the studio is opened on localhost', () => {
    openedAt('http://localhost:5173/session/x');
    expect(joinBase(cfg()).base).toBe('http://192.168.50.200:5173');
  });

  it('also does when the studio was opened on a lower-ranked address of this same computer', () => {
    openedAt('http://10.134.240.59:5173/session/x');
    expect(joinBase(cfg()).base).toBe('http://192.168.50.200:5173');
  });

  it('keeps the current address when it is a domain, and PUBLIC_URL wins over everything', () => {
    openedAt('https://class.example.com/session/x');
    expect(joinBase(cfg()).base).toBe('https://class.example.com');
    expect(joinBase(cfg({ publicUrl: 'https://join.example.org' })).base).toBe('https://join.example.org');
  });
});
