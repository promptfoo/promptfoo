export function getCurrentTimestamp() {
  return Math.floor(new Date().getTime() / 1000);
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Normalizes a timestamp to Unix epoch milliseconds.
 * Handles both numeric timestamps and SQLite CURRENT_TIMESTAMP strings.
 *
 * SQLite's CURRENT_TIMESTAMP returns UTC strings like "2025-12-27 06:52:56".
 * We append 'Z' to ensure correct UTC parsing (otherwise JS treats it as local time).
 *
 * @param value - Timestamp as number (epoch ms) or string (SQLite format)
 * @returns Unix epoch milliseconds
 * @throws Error if the string cannot be parsed as a valid date
 */
export function normalizeTimestamp(value: string | number): number {
  if (typeof value === 'number') {
    return value;
  }
  // SQLite CURRENT_TIMESTAMP is UTC; append 'Z' for correct parsing
  const normalized = value.endsWith('Z') ? value : value + 'Z';
  const timestamp = new Date(normalized).getTime();
  if (Number.isNaN(timestamp)) {
    throw new Error(`Invalid timestamp format: "${value}"`);
  }
  return timestamp;
}
