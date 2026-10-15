/** Extracts the 6-digit session code from a scanned QR payload (a join link) or a bare code. */
export function parseJoinCode(text: string): string | null {
  const t = text.trim();
  if (/^\d{6}$/.test(t)) return t;
  const m = /\/join\/(\d{6})(?:[/?#]|$)/.exec(t);
  return m ? m[1] : null;
}
