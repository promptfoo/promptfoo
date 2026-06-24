import { getRuntimeCompatibilityNotice } from '../../runtimeCompatibility';

export function getRuntimeNoticeForVersionResponse(
  currentVersion = process.version,
  warningsDisabled = false,
) {
  return warningsDisabled ? null : getRuntimeCompatibilityNotice(currentVersion);
}

export function isUpdateAvailableForRuntime(
  updateAvailable: boolean,
  updateBlockedByRuntime: boolean,
): boolean {
  return updateAvailable && !updateBlockedByRuntime;
}
