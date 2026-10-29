/**
 * Truncates a string to a maximum length, adding an ellipsis (...) if truncated.
 * @param str The string to truncate
 * @param maxLen The maximum length of the resulting string, including the ellipsis
 * @returns The truncated string, with ellipsis if necessary
 */
export function ellipsize(str: string, maxLen: number): string {
  if (str.length > maxLen) {
    const ellipsis = maxLen < 3 ? '' : '...';
    const prefix = str.slice(0, Math.max(0, maxLen - ellipsis.length));
    const lastCodeUnit = prefix.charCodeAt(prefix.length - 1);

    // Avoid leaving an unpaired high surrogate when truncation cuts an emoji.
    const safePrefix =
      lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff ? prefix.slice(0, -1) : prefix;

    return safePrefix + ellipsis;
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
