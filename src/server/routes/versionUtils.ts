import { getRuntimeCompatibilityNotice } from '../../runtimeCompatibility';

export function getRuntimeNoticeForVersionResponse(
  currentVersion = process.version,
  warningsDisabled = false,
) {
  return warningsDisabled ? null : getRuntimeCompatibilityNotice(currentVersion);
}

export function getRuntimePolicyForVersionResponse(currentVersion = process.version) {
  const notice = getRuntimeCompatibilityNotice(currentVersion);
  return notice ? { supportEndDate: notice.removalDate } : null;
}

export function isUpdateAvailableForRuntime(
  updateAvailable: boolean,
  updateBlockedByRuntime: boolean,
): boolean {
  return updateAvailable && !updateBlockedByRuntime;
}
