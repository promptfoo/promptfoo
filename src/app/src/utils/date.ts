/**
 * Utility functions for date formatting
 */

/**
 * Format a date value for display in DataGrid columns.
 * Uses locale string with short timezone name.
 *
 * @param value - The date value to format (string, number, or Date)
 * @returns Formatted date string with timezone, or empty string if value is invalid
 */
export function formatDataGridDate(value: string | number | Date | null | undefined): string {
  if (!value) {
    return '';
  }

  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
