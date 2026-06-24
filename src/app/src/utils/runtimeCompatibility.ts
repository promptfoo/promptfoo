// Frontend twin of the CLI cadence math in src/runtimeCompatibility.ts. The Web UI is a separate
// Vite project and cannot import backend modules, so the final-phase length and the weekly→daily
// rule are duplicated here. Keep these constants and getRuntimeNoticeReminderIntervalDays in sync
// with the backend FINAL_NOTICE_PHASE_MS / getRuntimeNoticeReminderIntervalMs.
const DAY_MS = 24 * 60 * 60 * 1000;
export const FINAL_RUNTIME_NOTICE_PHASE_MS = 14 * DAY_MS;

interface RuntimeNoticeCadence {
  removalDate: string;
  reminderIntervalDays: 1 | 7;
}

export function getRuntimeNoticeReminderIntervalDays(
  notice: RuntimeNoticeCadence,
  now: number = Date.now(),
): 1 | 7 {
  const removalTimestamp = Date.parse(`${notice.removalDate}T00:00:00.000Z`);
  if (Number.isNaN(removalTimestamp)) {
    return notice.reminderIntervalDays;
  }
  return removalTimestamp - now <= FINAL_RUNTIME_NOTICE_PHASE_MS ? 1 : 7;
}
