import { Hono } from 'hono';

import { VERSION } from '../../../constants';
import { getEnvBool } from '../../../envars';
import logger from '../../../logger';
import { getLatestVersion } from '../../../updates';
import { getUpdateCommands } from '../../../updates/updateCommands';
import { isRunningUnderNpx } from '../../../util/promptfooCommand';

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
async function isUpdateAvailable(latestVersion: string | null, currentVersion: string): Promise<boolean> {
  // No update info available
  if (!latestVersion) {
    return false;
  }

  // Don't show updates for development builds
  if (isDevVersion(currentVersion)) {
    return false;
  }

  // Dynamic import for semver to avoid top-level import issues
  const [semverGt, semverValid] = await Promise.all([
    import('semver/functions/gt.js').then((m) => m.default),
    import('semver/functions/valid.js').then((m) => m.default),
  ]);

  // Use semver comparison if both versions are valid semver
  if (semverValid(latestVersion) && semverValid(currentVersion)) {
    return semverGt(latestVersion, currentVersion);
  }

  // Fallback to string comparison if semver parsing fails
  // This handles edge cases like custom version strings
  return latestVersion !== currentVersion;
}

// Cache for the latest version check
let versionCache: {
  latestVersion: string | null;
  timestamp: number;
  lastAttempt: number;
} = {
  latestVersion: null,
  timestamp: 0,
  lastAttempt: 0,
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
const FAILURE_RETRY_DELAY = 60 * 1000; // 1 minute

export const versionRouter = new Hono();

versionRouter.get('/', async (c) => {
  try {
    const now = Date.now();
    let latestVersion = versionCache.latestVersion;

    const cacheExpired = now - versionCache.timestamp > CACHE_DURATION;
    const canRetry = now - versionCache.lastAttempt > FAILURE_RETRY_DELAY;

    // Fetch if: (no cache OR cache expired) AND we haven't tried recently
    if ((!latestVersion || cacheExpired) && canRetry) {
      versionCache.lastAttempt = now;
      try {
        latestVersion = await getLatestVersion();
        versionCache = {
          latestVersion,
          timestamp: now,
          lastAttempt: now,
        };
      } catch (error) {
        logger.debug(`Failed to fetch latest version: ${error}`);
        latestVersion = versionCache.latestVersion ?? VERSION;
      }
    }

    const selfHosted = getEnvBool('PROMPTFOO_SELF_HOSTED');
    const isNpx = isRunningUnderNpx();
    const updateCommands = getUpdateCommands({ selfHosted, isNpx });

    const resolvedLatestVersion = latestVersion ?? VERSION;

    return c.json({
      currentVersion: VERSION,
      latestVersion: resolvedLatestVersion,
      updateAvailable: await isUpdateAvailable(resolvedLatestVersion, VERSION),
      selfHosted,
      isNpx,
      updateCommands,
      commandType: updateCommands.commandType,
    });
  } catch (error) {
    logger.error(`Error in version check endpoint: ${error}`);
    const selfHosted = getEnvBool('PROMPTFOO_SELF_HOSTED');
    const isNpx = isRunningUnderNpx();
    const updateCommands = getUpdateCommands({ selfHosted, isNpx });

    return c.json(
      {
        error: 'Failed to check version',
        currentVersion: VERSION,
        latestVersion: VERSION,
        updateAvailable: false,
        selfHosted,
        isNpx,
        updateCommands,
        commandType: updateCommands.commandType,
      },
      500,
    );
  }
});

export default versionRouter;
