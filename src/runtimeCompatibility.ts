export const NODE_20_RUNTIME_NOTICE_ID = 'node20-removal-2026-07-30';
export const NODE_20_SUPPORT_END_DATE = '2026-07-30';
export const NODE_20_SUPPORT_END_DATE_LABEL = 'July 30, 2026';
export const NODE_MINIMUM_UPGRADE_VERSION = '22.22.0';
export const NODE_RECOMMENDED_VERSION = '24 LTS';
export const NODE_RUNTIME_UPGRADE_GUIDE_URL =
  'https://www.promptfoo.dev/docs/installation/#nodejs-runtime-support';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const FINAL_NOTICE_PHASE_MS = 14 * DAY_MS;
const NODE_20_SUPPORT_END_TIMESTAMP = Date.parse(`${NODE_20_SUPPORT_END_DATE}T00:00:00.000Z`);

export interface RuntimeCompatibilityNotice {
  id: typeof NODE_20_RUNTIME_NOTICE_ID;
  kind: 'runtime_deprecation';
  runtime: 'node';
  currentVersion: string;
  currentMajor: 20;
  removalDate: typeof NODE_20_SUPPORT_END_DATE;
  minimumVersion: typeof NODE_MINIMUM_UPGRADE_VERSION;
  recommendedVersion: typeof NODE_RECOMMENDED_VERSION;
  documentationUrl: typeof NODE_RUNTIME_UPGRADE_GUIDE_URL;
  reminderIntervalDays: 1 | 7;
}

interface RuntimeCompatibilityOptions {
  isBun?: boolean;
  isDeno?: boolean;
  now?: Date;
}

export function parseNodeMajor(version: string): number | null {
  const match = /^v?(\d+)(?:\.|$)/.exec(version);
  return match ? Number.parseInt(match[1], 10) : null;
}

export function getRuntimeCompatibilityNotice(
  currentVersion: string = process.version,
  options: RuntimeCompatibilityOptions = {},
): RuntimeCompatibilityNotice | null {
  const isBun = options.isBun ?? typeof (globalThis as Record<string, unknown>).Bun !== 'undefined';
  const isDeno =
    options.isDeno ?? typeof (globalThis as Record<string, unknown>).Deno !== 'undefined';

  if (isBun || isDeno || parseNodeMajor(currentVersion) !== 20) {
    return null;
  }

  return {
    id: NODE_20_RUNTIME_NOTICE_ID,
    kind: 'runtime_deprecation',
    runtime: 'node',
    currentVersion,
    currentMajor: 20,
    removalDate: NODE_20_SUPPORT_END_DATE,
    minimumVersion: NODE_MINIMUM_UPGRADE_VERSION,
    recommendedVersion: NODE_RECOMMENDED_VERSION,
    documentationUrl: NODE_RUNTIME_UPGRADE_GUIDE_URL,
    reminderIntervalDays:
      getRuntimeNoticeReminderIntervalMs(options.now ?? new Date()) === DAY_MS ? 1 : 7,
  };
}

export function isLatestUpdateBlockedByRuntime(
  currentVersion: string = process.version,
  now: Date = new Date(),
): boolean {
  return (
    getRuntimeCompatibilityNotice(currentVersion, { now }) !== null && hasNode20SupportEnded(now)
  );
}

export function isUpdateBlockedByRuntime(
  commandType: 'docker' | 'npm' | 'npx',
  currentVersion: string = process.version,
  now: Date = new Date(),
): boolean {
  return commandType !== 'docker' && isLatestUpdateBlockedByRuntime(currentVersion, now);
}

export function hasNode20SupportEnded(now: Date = new Date()): boolean {
  return now.getTime() >= NODE_20_SUPPORT_END_TIMESTAMP;
}

export function getRuntimeNoticeReminderIntervalMs(now: Date = new Date()): number {
  const timeUntilRemoval = NODE_20_SUPPORT_END_TIMESTAMP - now.getTime();
  return timeUntilRemoval <= FINAL_NOTICE_PHASE_MS ? DAY_MS : WEEK_MS;
}

export function shouldShowRuntimeNotice(
  lastShownAt: string | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastShownAt) {
    return true;
  }

  const lastShownTimestamp = Date.parse(lastShownAt);
  if (Number.isNaN(lastShownTimestamp)) {
    return true;
  }

  return now.getTime() - lastShownTimestamp >= getRuntimeNoticeReminderIntervalMs(now);
}
