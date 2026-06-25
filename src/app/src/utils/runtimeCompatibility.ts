// Frontend twin of the CLI cadence math in src/runtimeCompatibility.ts. The Web UI is a separate
// Vite project and cannot import backend modules, so the final-phase length and the weekly→daily
// rule are duplicated here. Keep these constants and getRuntimeNoticeReminderIntervalDays in sync
// with the backend FINAL_NOTICE_PHASE_MS / getRuntimeNoticeReminderIntervalMs.
const DAY_MS = 24 * 60 * 60 * 1000;
export const FINAL_RUNTIME_NOTICE_PHASE_MS = 14 * DAY_MS;

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

interface RuntimeNoticeCadence {
  removalDate: string;
  reminderIntervalDays: 1 | 7;
}

export function getRuntimeNoticeReminderIntervalDays(
  notice: RuntimeNoticeCadence,
  now: number = Date.now(),
): 1 | 7 {
  const removalTimestamp = parseUtcMidnight(notice.removalDate);
  if (removalTimestamp === null) {
    return notice.reminderIntervalDays;
  }
  return removalTimestamp - now <= FINAL_RUNTIME_NOTICE_PHASE_MS ? 1 : 7;
}
