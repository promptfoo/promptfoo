export const NODE_20_RUNTIME_NOTICE_ID = 'node20-removal-2026-07-30';
export const NODE_20_SUPPORT_END_DATE = '2026-07-30';
export const NODE_20_SUPPORT_END_DATE_LABEL = 'July 30, 2026';
export const NODE_MINIMUM_UPGRADE_VERSION = '22.22.0';
export const NODE_RECOMMENDED_VERSION = '24 LTS';
export const NODE_RUNTIME_UPGRADE_GUIDE_URL =
  'https://www.promptfoo.dev/docs/installation/#nodejs-runtime-support';

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
