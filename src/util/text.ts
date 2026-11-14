/** Truncate to maxLen UTF-16 code units, reserving room for `...` when it fits. */
export function ellipsize(str: string, maxLen: number): string {
  if (str.length > maxLen) {
    const suffix = maxLen < 3 ? '' : '...';
    let end = Math.max(0, Math.trunc(maxLen) - suffix.length);
    const last = str.charCodeAt(end - 1);
    // A trailing high surrogate would leave half a character in the displayed prefix.
    if (last >= 0xd800 && last <= 0xdbff) {
      end--;
    }
    return str.slice(0, end) + suffix;
  }
  return str;
}

/**
 * Escapes special regex characters in a string.
 * Use this when building regex patterns from dynamic input to prevent ReDoS attacks.
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
