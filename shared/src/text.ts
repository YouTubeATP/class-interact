/** Collapse whitespace, normalise unicode (NFKC) and trim. Keeps the author's casing. */
export function cleanText(input: string): string {
  return input.normalize('NFKC').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Grouping key for free-text answers: case-insensitive, punctuation-insensitive,
 * whitespace-insensitive. "Savoury!", " savoury " and "SAVOURY" share one key.
 * Multiword answers stay together ("slightly sweet" is one term).
 */
export function normalizeKey(input: string): string {
  return cleanText(input)
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/(^|\s)['-]+|['-]+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function countWords(input: string): number {
  const t = cleanText(input);
  return t ? t.split(' ').length : 0;
}

/** Case-insensitive, whitespace-insensitive key for participant display names. */
export function nameKey(input: string): string {
  return cleanText(input).toLowerCase();
}
