/**
 * Safely formats variables for display in progress bars and logs.
 * Handles extremely large variables that could cause RangeError crashes.
 *
 * @param vars - Variables to format
 * @param maxLength - Maximum length of the final formatted string
 * @returns Formatted variables string or fallback message
 */
export function formatVarsForDisplay(
  vars: Record<string, unknown> | undefined,
  maxLength: number,
): string {
  if (!vars || Object.keys(vars).length === 0) {
    return '';
  }

  try {
    // Simple approach: limit individual values, then truncate the whole result
    const formatted = Object.entries(vars)
      .map(([key, value]) => {
        // Prevent memory issues by limiting individual values first
        const valueStr = String(value).slice(0, 100);
        return `${key}=${valueStr}`;
      })
      .join(' ')
      .replace(/\n/g, ' ')
      .slice(0, maxLength);

    return formatted;
  } catch {
    // Any error - return safe fallback
    return '[vars unavailable]';
  }
}
