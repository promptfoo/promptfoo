import express from 'express';
import semverGt from 'semver/functions/gt.js';
import semverValid from 'semver/functions/valid.js';
import { VERSION } from '../../constants';
import { getEnvBool } from '../../envars';
import logger from '../../logger';
import { isUpdateBlockedByRuntime } from '../../runtimeCompatibility';
import { VersionSchemas } from '../../types/api/version';
import { getLatestVersion } from '../../updates';
import { getUpdateCommands } from '../../updates/updateCommands';
import { isRunningUnderNpx } from '../../util/promptfooCommand';
import {
  getRuntimeNoticeForVersionResponse,
  getRuntimePolicyForVersionResponse,
  isUpdateAvailableForRuntime,
} from './versionUtils';
import type { Request, Response } from 'express';

/**
 * Check if a version string indicates a development build.
 */
function isDevVersion(version: string): boolean {
  return version.includes('development') || version === '0.0.0';
}

/**
 * Determine if an update is available using semantic version comparison.
 * Returns false for development builds to avoid spurious update prompts.
 */
function isUpdateAvailable(latestVersion: string | null, currentVersion: string): boolean {
  // No update info available
  if (!latestVersion) {
    return false;
  }

  // Don't show updates for development builds
  if (isDevVersion(currentVersion)) {
    return false;
  }

  // Use semver comparison if both versions are valid semver
  if (semverValid(latestVersion) && semverValid(currentVersion)) {
    return semverGt(latestVersion, currentVersion);
  }

  // Fallback to string comparison if semver parsing fails
  // This handles edge cases like custom version strings
  return latestVersion !== currentVersion;
}

/**
 * Build the version-response fields shared by the success and error paths: environment-derived
 * update commands plus the runtime compatibility notice/policy. All inputs are synchronous and
 * cannot throw, so this is safe to call from the 500 fallback handler.
 */
function buildBaseVersionFields() {
  const selfHosted = getEnvBool('PROMPTFOO_SELF_HOSTED');
  const isContainer = getEnvBool('PROMPTFOO_RUNNING_IN_DOCKER');
  const isOfficialDockerImage = getEnvBool('PROMPTFOO_OFFICIAL_DOCKER_IMAGE');
  const isNpx = isRunningUnderNpx();
  const updateCommands = getUpdateCommands({ isContainer, isOfficialDockerImage, isNpx });
  return {
    currentVersion: VERSION,
    selfHosted,
    isNpx,
    updateCommands,
    commandType: updateCommands.commandType,
    runtimeNotice: getRuntimeNoticeForVersionResponse(
      process.version,
      getEnvBool('PROMPTFOO_DISABLE_RUNTIME_WARNINGS'),
    ),
    runtimePolicy: getRuntimePolicyForVersionResponse(process.version),
    updateBlockedByRuntime: isUpdateBlockedByRuntime(updateCommands.commandType),
  };
}

const router = express.Router();

// Cache for the latest version check
let versionCache: {
  latestVersion: string | null;
  timestamp: number;
  lastAttempt: number; // Track when we last tried to fetch (for rate limiting failures)
} = {
  latestVersion: null,
  timestamp: 0,
  lastAttempt: 0,
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
// Rate limit failed fetches to prevent hammering upstream during outages.
// 60s is a balance between quick recovery and not overwhelming the update service.
// During outages: ~60 requests/hour vs ~12 with 5-minute delay.
const FAILURE_RETRY_DELAY = 60 * 1000; // 1 minute

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const now = Date.now();
    const updateChecksDisabled = getEnvBool('PROMPTFOO_DISABLE_UPDATE');
    let latestVersion = updateChecksDisabled ? VERSION : versionCache.latestVersion;

    // A wall-clock rollback must not pin stale cache or failure-rate-limit state indefinitely.
    const cacheExpired =
      now < versionCache.timestamp || now - versionCache.timestamp > CACHE_DURATION;
    const canRetry =
      now < versionCache.lastAttempt || now - versionCache.lastAttempt > FAILURE_RETRY_DELAY;

    // Fetch if: (no cache OR cache expired) AND we haven't tried recently
    if (!updateChecksDisabled && (!latestVersion || cacheExpired) && canRetry) {
      versionCache.lastAttempt = now; // Mark attempt time before trying
      try {
        latestVersion = await getLatestVersion();
        // Update cache only on success
        versionCache = {
          latestVersion,
          timestamp: now,
          lastAttempt: now,
        };
      } catch (error) {
        logger.debug(`Failed to fetch latest version: ${error}`);
        // On failure, use stale cache if available, otherwise fall back to VERSION
        // This maintains API contract (latestVersion is always a string)
        // lastAttempt already updated above - prevents hammering
        latestVersion = versionCache.latestVersion ?? VERSION;
      }
    }

    const base = buildBaseVersionFields();
    // Ensure latestVersion is never null in response (maintains API contract)
    const resolvedLatestVersion = latestVersion ?? VERSION;
    const latestUpdateAvailable = isUpdateAvailable(resolvedLatestVersion, VERSION);
    const response = {
      ...base,
      latestVersion: resolvedLatestVersion,
      updateAvailable: isUpdateAvailableForRuntime(
        latestUpdateAvailable,
        base.updateBlockedByRuntime,
      ),
      blockedUpdateNotice:
        latestUpdateAvailable && base.updateBlockedByRuntime && !base.runtimeNotice
          ? getRuntimeNoticeForVersionResponse(process.version)
          : null,
    };

    res.json(VersionSchemas.Response.parse(response));
  } catch (error) {
    logger.error(`Error in version check endpoint: ${error}`);
    res.status(500).json({
      ...buildBaseVersionFields(),
      error: 'Failed to check version',
      latestVersion: VERSION,
      updateAvailable: false,
      blockedUpdateNotice: null,
    });
  }
});

export default router;
