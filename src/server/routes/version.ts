import express from 'express';
import { VERSION } from '../../constants';
import { getEnvBool } from '../../envars';
import { getLatestVersion } from '../../updates';
import { getUpdateCommands } from '../../updates/updateCommands';
import { isRunningUnderNpx } from '../../util';
import logger from '../../logger';
import type { Request, Response } from 'express';

const router = express.Router();

// Cache for the latest version check
let versionCache: {
  latestVersion: string | null;
  timestamp: number;
} = {
  latestVersion: null,
  timestamp: 0,
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const now = Date.now();
    let latestVersion = versionCache.latestVersion;

    // Check if cache is expired
    if (!latestVersion || now - versionCache.timestamp > CACHE_DURATION) {
      try {
        latestVersion = await getLatestVersion();
        // Update cache
        versionCache = {
          latestVersion,
          timestamp: now,
        };
      } catch (error) {
        logger.debug(`Failed to fetch latest version: ${error}`);
        // If we can't get the latest version, return current version
        latestVersion = VERSION;
        // Update cache timestamp even on failure to avoid hammering upstream
        versionCache = {
          latestVersion,
          timestamp: now,
        };
      }
    }

    const selfHosted = getEnvBool('PROMPTFOO_SELF_HOSTED');
    const isNpx = isRunningUnderNpx();
    const updateCommands = getUpdateCommands({ selfHosted, isNpx });

    const response = {
      currentVersion: VERSION,
      latestVersion,
      updateAvailable: latestVersion !== VERSION && latestVersion !== null,
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
