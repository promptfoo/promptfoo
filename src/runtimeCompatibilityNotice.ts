import chalk from 'chalk';
import { getEnvBool, getEnvString, isNonInteractive } from './envars';
import { readGlobalConfig, writeGlobalConfig } from './globalConfig/globalConfig';
import {
  getRuntimeCompatibilityNotice,
  hasNode20SupportEnded,
  shouldShowRuntimeNotice,
} from './runtimeCompatibility';
import telemetry from './telemetry';
import {
  NODE_20_SUPPORT_END_DATE_LABEL,
  type RuntimeCompatibilityNotice,
} from './types/runtimeCompatibility';

interface RuntimeNoticeOptions {
  currentVersion?: string;
  now?: Date;
  nonInteractive?: boolean;
}

export function formatRuntimeCompatibilityNotice(
  notice: RuntimeCompatibilityNotice,
  compact: boolean,
  now: Date = new Date(),
): string {
  const supportStatus = hasNode20SupportEnded(now) ? 'ended' : 'ends';
  if (compact) {
    return [
      `Node.js 20 support in promptfoo ${supportStatus} ${NODE_20_SUPPORT_END_DATE_LABEL}.`,
      `Detected ${notice.currentVersion}.`,
      `Upgrade to Node.js ${notice.minimumVersion} or newer (${notice.recommendedVersion} recommended).`,
      notice.documentationUrl,
    ].join(' ');
  }

  return [
    chalk.yellow.bold(`⚠ Node.js 20 support ${supportStatus} ${NODE_20_SUPPORT_END_DATE_LABEL}`),
    '',
    `Detected: ${notice.currentVersion}`,
    `Upgrade to Node.js ${notice.minimumVersion} or newer. Node.js ${notice.recommendedVersion} is recommended.`,
    '',
    `Upgrade guide: ${notice.documentationUrl}`,
  ].join('\n');
}

export function maybeWarnAboutRuntime(options: RuntimeNoticeOptions = {}): boolean {
  if (getEnvBool('PROMPTFOO_DISABLE_RUNTIME_WARNINGS') || getEnvString('LOG_LEVEL') === 'error') {
    return false;
  }

  const currentVersion = options.currentVersion ?? process.version;
  const now = options.now ?? new Date();
  const notice = getRuntimeCompatibilityNotice(currentVersion);
  if (!notice) {
    return false;
  }

  try {
    const config = readGlobalConfig();
    if (!shouldShowRuntimeNotice(config.notices?.[notice.id]?.lastShownAt, now)) {
      return false;
    }
  } catch {
    // State is best-effort. If it cannot be read, fail open and show the notice.
  }

  const compact = options.nonInteractive ?? isNonInteractive();
  console.warn(formatRuntimeCompatibilityNotice(notice, compact, now));

  telemetry.record('feature_used', {
    feature: 'runtime_compatibility_notice',
    noticeId: notice.id,
    action: 'shown',
    surface: 'cli_startup',
    variant: compact ? 'compact' : 'full',
  });

  try {
    // Re-read immediately before writing to preserve unrelated settings changed while the notice
    // was rendered. Concurrent first-run processes may both show the notice, but must not widen the
    // read/modify/write window unnecessarily.
    const latestConfig = readGlobalConfig();
    writeGlobalConfig({
      ...latestConfig,
      notices: {
        ...latestConfig.notices,
        [notice.id]: { lastShownAt: now.toISOString() },
      },
    });
  } catch {
    // A persistence failure must not prevent the CLI command or duplicate this run's notice.
  }
  return true;
}

interface StartupCheckDependencies {
  checkForUpdates: (options: { suppressRuntimeBlockedWarning?: boolean }) => Promise<unknown>;
  warnAboutRuntime?: () => boolean;
  runtimeNoticeApplies?: () => boolean;
  runtimeWarningsDisabled?: () => boolean;
}

/**
 * Show the Node.js runtime notice when its cadence is due, then run the ordinary update check.
 * Suppress duplicate post-cutoff guidance while warnings are enabled, including between reminder
 * windows. Explicitly disabling runtime notices leaves independent update guidance enabled.
 */
export async function runStartupRuntimeAndUpdateChecks({
  checkForUpdates,
  warnAboutRuntime = maybeWarnAboutRuntime,
  runtimeNoticeApplies = () => getRuntimeCompatibilityNotice() !== null,
  runtimeWarningsDisabled = () => getEnvBool('PROMPTFOO_DISABLE_RUNTIME_WARNINGS'),
}: StartupCheckDependencies): Promise<void> {
  const noticeApplies = runtimeNoticeApplies();
  warnAboutRuntime();
  await checkForUpdates({
    // A cadence-suppressed notice must not reappear through the update checker. An explicit warning
    // opt-out still allows independent update guidance, preserving the prior review disposition.
    suppressRuntimeBlockedWarning: noticeApplies && !runtimeWarningsDisabled(),
  });
}
