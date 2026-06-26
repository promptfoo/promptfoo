import chalk from 'chalk';
import { getEnvBool, getEnvString, isNonInteractive } from './envars';
import { getRuntimeCompatibilityNotice, hasNode20SupportEnded } from './runtimeCompatibility';
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

  const compact = options.nonInteractive ?? isNonInteractive();
  console.warn(formatRuntimeCompatibilityNotice(notice, compact, now));

  telemetry.record('feature_used', {
    feature: 'runtime_compatibility_notice',
    noticeId: notice.id,
    action: 'shown',
    surface: 'cli_startup',
    variant: compact ? 'compact' : 'full',
  });
  return true;
}

interface StartupCheckDependencies {
  checkForUpdates: (options: { suppressRuntimeBlockedWarning?: boolean }) => Promise<unknown>;
  warnAboutRuntime?: () => boolean;
  runtimeNoticeApplies?: () => boolean;
}

/**
 * Show the Node.js runtime notice, then run the ordinary update check. When the notice was shown,
 * checkForUpdates can suppress a duplicate post-cutoff "update blocked" warning. Collaborators are
 * injectable for testing; production passes only checkForUpdates.
 */
export async function runStartupRuntimeAndUpdateChecks({
  checkForUpdates,
  warnAboutRuntime = maybeWarnAboutRuntime,
  runtimeNoticeApplies = () => getRuntimeCompatibilityNotice() !== null,
}: StartupCheckDependencies): Promise<void> {
  const noticeApplies = runtimeNoticeApplies();
  const noticeShown = warnAboutRuntime();
  await checkForUpdates({ suppressRuntimeBlockedWarning: noticeApplies && noticeShown });
}
