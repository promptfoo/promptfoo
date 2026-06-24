import chalk from 'chalk';
import { getEnvBool, getEnvString, isNonInteractive } from './envars';
import { readGlobalConfig, writeGlobalConfig } from './globalConfig/globalConfig';
import logger from './logger';
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
    "Upgrading also lets promptfoo move to Node's built-in SQLite, removing a platform-specific database binding.",
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
  const notice = getRuntimeCompatibilityNotice(currentVersion, { now });
  if (!notice) {
    return false;
  }

  try {
    const config = readGlobalConfig();
    if (!shouldShowRuntimeNotice(config.notices?.[notice.id]?.lastShownAt, now)) {
      return false;
    }
  } catch (error) {
    logger.debug('Unable to read runtime notice state; showing the notice without persistence', {
      error,
    });
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
    // Re-read immediately before writing so startup output and telemetry do not widen the
    // lost-update window for unrelated account, cloud, or consent settings.
    const latestConfig = readGlobalConfig();
    writeGlobalConfig({
      ...latestConfig,
      notices: {
        ...latestConfig.notices,
        [notice.id]: { lastShownAt: now.toISOString() },
      },
    });
    return true;
  } catch (error) {
    logger.debug('Unable to persist runtime notice state', { error });
    // The warning was displayed, but it will recur because no reminder state was saved. Let the
    // caller continue compatible update checks instead of suppressing them indefinitely.
    return false;
  }
}
