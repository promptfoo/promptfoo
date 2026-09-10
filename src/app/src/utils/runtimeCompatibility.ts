const DAY_MS = 24 * 60 * 60 * 1000;
export const FINAL_RUNTIME_NOTICE_PHASE_MS = 14 * DAY_MS;

/** Parse a `YYYY-MM-DD` date as UTC midnight. Returns epoch ms, or null when the string is invalid. */
export function parseUtcMidnight(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  if (Number.isNaN(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
    return null;
  }
  return timestamp;
}

/** Whether the runtime support cutoff (UTC midnight on `removalDate`) has passed. */
export function hasRuntimeSupportEnded(removalDate: string, now: number = Date.now()): boolean {
  const removalTimestamp = parseUtcMidnight(removalDate);
  return removalTimestamp !== null && now >= removalTimestamp;
}

export function getRuntimeNoticeReminderIntervalDays(
  removalDate: string,
  now: number = Date.now(),
): 1 | 7 {
  const removalTimestamp = parseUtcMidnight(removalDate);
  if (removalTimestamp === null) {
    return 7;
  }
  return removalTimestamp - now <= FINAL_RUNTIME_NOTICE_PHASE_MS ? 1 : 7;
}
