/**
 * Truncates a string to a maximum length, adding an ellipsis (...) if truncated.
 * @param str The string to truncate
 * @param maxLen The maximum length of the resulting string, including the ellipsis
 * @returns The truncated string, with ellipsis if necessary
 */
export function ellipsize(str: string, maxLen: number): string {
  if (str.length > maxLen) {
    return str.slice(0, maxLen - 3) + '...';
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
