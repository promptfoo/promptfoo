// Decoding helpers for common encodings used in red team strategies

/**
 * Attempts to decode a base64 string. Returns null if it looks invalid or decoding fails.
 */
export function tryDecodeBase64(str: string): string | null {
  try {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(str) || str.length < 8) {
      return null;
    }
    const decoded =
      typeof atob !== 'undefined' ? atob(str) : Buffer.from(str, 'base64').toString('binary');
    const printable = decoded.replace(/[\x00-\x08\x0E-\x1F\x7F]/g, '');
    return printable.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * Attempts to decode space-separated hex bytes (e.g. "68 65 6C 6C 6F"). Returns null if invalid.
 */
export function tryDecodeHex(str: string): string | null {
  if (!/^(?:[0-9A-Fa-f]{2}(?:\s+|$))+$/u.test(str)) {
    return null;
  }
  try {
    const bytes = str
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((b) => parseInt(b, 16));
    return String.fromCharCode(...bytes);
  } catch {
    return null;
  }
}
