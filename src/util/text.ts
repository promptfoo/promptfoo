/**
 * Truncates a string to a maximum length, adding an ellipsis (...) if truncated.
 * @param str The string to truncate
 * @param maxLen The maximum length in UTF-16 code units, including the ellipsis
 * @returns The truncated string, with ellipsis if necessary
 */
export function ellipsize(str: string, maxLen: number): string {
  if (str.length > maxLen) {
    const suffix = maxLen < 3 ? '' : '...';
    const end = Math.max(0, Math.trunc(maxLen - suffix.length));
    // Back up when the cutoff falls inside a surrogate pair.
    const codePoint = str.codePointAt(end - 1) ?? 0;
    const safeEnd = codePoint > 0xffff ? end - 1 : end;
    return str.slice(0, safeEnd) + suffix;
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
