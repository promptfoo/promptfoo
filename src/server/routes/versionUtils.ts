import { getRuntimeCompatibilityNotice } from '../../runtimeCompatibility';

export function getRuntimeNoticeForVersionResponse(
  currentVersion = process.version,
  warningsDisabled = false,
) {
  return warningsDisabled ? null : getRuntimeCompatibilityNotice(currentVersion);
}
