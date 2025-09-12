// Strategy-based decoding helpers for red team strategies

/**
 * Set of strategy IDs that represent encoding transformations where originalText should be shown
 */
const ENCODING_STRATEGIES = new Set([
  'base64',
  'hex',
  'rot13',
  'leetspeak',
  'homoglyph',
  'morse',
  'atbash',
  'pigLatin',
  'reverse',
  'binary',
  'octal',
  'audio',
  'image',
  'video',
]);

/**
 * Determines if a strategy represents an encoding where we should show the original text
 */
export function isEncodingStrategy(strategyId: string | undefined): boolean {
  return strategyId ? ENCODING_STRATEGIES.has(strategyId) : false;
}

/**
 * Lightweight check to avoid decoding large binary content like audio/images
 */
function isLikelyBinaryContent(str: string): boolean {
  return (
    str.startsWith('data:audio/') ||
    str.startsWith('data:image/') ||
    str.startsWith('data:video/') ||
    str.length > 5000
  ); // Large base64 is likely binary
}

/**
 * Attempts to decode text-based base64, avoiding expensive binary content
 */
export function tryDecodeTextBase64(str: string): string | null {
  try {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(str) || str.length < 8 || isLikelyBinaryContent(str)) {
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
 * Attempts to decode space-separated hex bytes
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
