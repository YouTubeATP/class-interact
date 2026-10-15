import jsQR from 'jsqr';
import QR from 'qrcode';
import { describe, expect, it } from 'vitest';
import { parseJoinCode } from './joinCode';

describe('parseJoinCode', () => {
  it('accepts join links, with or without a trailing slash, query or hash', () => {
    expect(parseJoinCode('https://class.example.com/join/123456')).toBe('123456');
    expect(parseJoinCode('http://192.168.1.20:5173/join/654321/')).toBe('654321');
    expect(parseJoinCode('https://x.test/join/111222?utm=1')).toBe('111222');
  });
  it('accepts a bare 6-digit code', () => expect(parseJoinCode(' 123456 ')).toBe('123456'));
  it('rejects anything else', () => {
    for (const bad of ['', 'hello', 'https://example.com/', 'https://x.test/join/12345', 'https://x.test/join/1234567', 'WIFI:S:foo;;']) expect(parseJoinCode(bad)).toBeNull();
  });
});

/** Rasterises a QR the same way the app draws it, then decodes it as the scanner does. */
function rasterise(text: string, scale = 6, quiet = 4) {
  const qr = QR.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const size = (n + quiet * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (!qr.modules.get(x, y)) continue;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + quiet) * scale + dy) * size + (x + quiet) * scale + dx) * 4;
          data[i] = data[i + 1] = data[i + 2] = 22;
        }
    }
  return { data, size };
}

describe('QR scanning', () => {
  it('decodes the join link that the ticket encodes', () => {
    const link = 'https://class.example.com/join/482913';
    const { data, size } = rasterise(link);
    const hit = jsQR(data, size, size);
    expect(hit?.data).toBe(link);
    expect(parseJoinCode(hit!.data)).toBe('482913');
  });
  it('ignores QR codes that are not ClassInteract links', () => {
    const { data, size } = rasterise('https://example.com/menu');
    expect(parseJoinCode(jsQR(data, size, size)!.data)).toBeNull();
  });
});
