/** Parse a `YYYY-MM-DD` date as UTC midnight. Returns epoch ms, or null when the string is invalid. */
export function parseUtcMidnight(date: string): number | null {
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isNaN(timestamp) ? null : timestamp;
}

/** Whether the runtime support cutoff (UTC midnight on `removalDate`) has passed. */
export function hasRuntimeSupportEnded(removalDate: string, now: number = Date.now()): boolean {
  const removalTimestamp = parseUtcMidnight(removalDate);
  return removalTimestamp !== null && now >= removalTimestamp;
}
