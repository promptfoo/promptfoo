import semver from 'semver';
import logger from '../logger';
import { getLatestVersion } from '../updates';
import { VERSION } from '../version';

export interface UpdateInfo {
  current: string;
  latest: string;
  name: string;
}

export interface UpdateObject {
  message: string;
  update: UpdateInfo;
}

export interface CheckForUpdatesOptions {
  throwOnError?: boolean;
}

const PACKAGE_NAME = 'promptfoo';

export async function checkForUpdates(
  options: CheckForUpdatesOptions = {},
): Promise<UpdateObject | null> {
  try {
    // Skip update check when running from source (development mode)
    if (process.env.NODE_ENV === 'development') {
      return null;
    }

    if (!VERSION) {
      return null;
    }

    // Use custom API to get latest version
    const latestVersion = await getLatestVersion();

    if (semver.gt(latestVersion, VERSION)) {
      const message = `Promptfoo update available! ${VERSION} → ${latestVersion}`;
      return {
        message,
        update: {
          current: VERSION,
          latest: latestVersion,
          name: PACKAGE_NAME,
        },
      };
    }

    return null;
  } catch (err) {
    if (options.throwOnError) {
      throw err;
    }
    // Use debug level to avoid spamming users with network errors
    // Don't expose full error object which might contain sensitive info
    const message = err instanceof Error ? err.message : String(err);
    logger.debug(`Failed to check for updates: ${message}`);
    return null;
  }
}
