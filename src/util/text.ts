/**
 * Truncates a string to a maximum length, adding an ellipsis (...) if truncated.
 * @param str The string to truncate
 * @param maxLen The maximum length of the resulting string, including the ellipsis
 * @returns The truncated string, with ellipsis if necessary
 */
export function ellipsize(str: string, maxLen: number): string {
  if (str.length > maxLen) {
    if (maxLen < 3) {
      // Not enough room for the ellipsis; hard-truncate so the result still
      // respects maxLen instead of slicing with a negative index.
      return str.slice(0, Math.max(0, maxLen));
    }
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

function isNumericCell(value: string): boolean {
  return value.trim() !== '' && Number.isFinite(Number(value));
}

/**
 * Neutralize spreadsheet formula (CSV) injection at export time (CWE-1236).
 *
 * Spreadsheet applications execute cells beginning with `=`, `+`, `-`, or `@`
 * as formulas. Prefix dangerous values with the spreadsheet-native text marker
 * while preserving finite signed numbers.
 *
 * Leading whitespace and zero-width characters are ignored when identifying a
 * trigger because spreadsheet applications can strip them before evaluation.
 */
export function escapeCsvFormula(value: string): string {
  if (value.length === 0) {
    return value;
  }

  const unpadded = value.replace(/^[\s\u200B\u200C\u200D]+/, '');
  const firstChar = unpadded[0];
  if (firstChar === undefined) {
    return value;
  }

  const isFormulaTrigger =
    firstChar === '=' ||
    firstChar === '@' ||
    ((firstChar === '-' || firstChar === '+') && !isNumericCell(unpadded));
  return isFormulaTrigger ? `'${value}` : value;
}
