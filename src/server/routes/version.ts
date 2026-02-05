import express from 'express';
import semverGt from 'semver/functions/gt.js';
import semverValid from 'semver/functions/valid.js';
import { VERSION } from '../../constants';
import { getEnvBool } from '../../envars';
import logger from '../../logger';
import { getLatestVersion } from '../../updates';
import { getUpdateCommands } from '../../updates/updateCommands';
import { isRunningUnderNpx } from '../../util/promptfooCommand';
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
    let latestVersion = versionCache.latestVersion;

    const cacheExpired = now - versionCache.timestamp > CACHE_DURATION;
    const canRetry = now - versionCache.lastAttempt > FAILURE_RETRY_DELAY;

    // Fetch if: (no cache OR cache expired) AND we haven't tried recently
    if ((!latestVersion || cacheExpired) && canRetry) {
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

    const selfHosted = getEnvBool('PROMPTFOO_SELF_HOSTED');
    const isNpx = isRunningUnderNpx();
    const updateCommands = getUpdateCommands({ selfHosted, isNpx });

    // Ensure latestVersion is never null in response (maintains API contract)
    const resolvedLatestVersion = latestVersion ?? VERSION;

    const response = {
      currentVersion: VERSION,
      latestVersion: resolvedLatestVersion,
      updateAvailable: isUpdateAvailable(resolvedLatestVersion, VERSION),
      selfHosted,
      isNpx,
      updateCommands,
      commandType: updateCommands.commandType,
    };

    res.json(response);
  } catch (error) {
    logger.error(`Error in version check endpoint: ${error}`);
    const selfHosted = getEnvBool('PROMPTFOO_SELF_HOSTED');
    const isNpx = isRunningUnderNpx();
    const updateCommands = getUpdateCommands({ selfHosted, isNpx });

    res.status(500).json({
      error: 'Failed to check version',
      currentVersion: VERSION,
      latestVersion: VERSION,
      updateAvailable: false,
      selfHosted,
      isNpx,
      updateCommands,
      commandType: updateCommands.commandType,
    });
  }
});

export default router;
