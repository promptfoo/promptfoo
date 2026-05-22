import semver from 'semver';
// Use require to load package.json - works reliably in both dev and published package
import packageJson from '../../package.json';
import logger from '../logger';
import { getLatestVersion } from '../updates';

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

/**
 * Read package.json from the current package
 */
function getPackageJson(): { name: string; version: string } | null {
  try {
    return {
      name: packageJson.name || 'promptfoo',
      version: packageJson.version,
    };
  } catch {
    return null;
  }
}

export async function checkForUpdates(
  options: CheckForUpdatesOptions = {},
): Promise<UpdateObject | null> {
  try {
    // Skip update check when running from source (development mode)
    if (process.env.NODE_ENV === 'development') {
      return null;
    }

    const packageJson = getPackageJson();
    if (!packageJson || !packageJson.name || !packageJson.version) {
      return null;
    }

    const { name, version: currentVersion } = packageJson;

    // Use custom API to get latest version
    const latestVersion = await getLatestVersion();

    if (semver.gt(latestVersion, currentVersion)) {
      const message = `Promptfoo update available! ${currentVersion} → ${latestVersion}`;
      return {
        message,
        update: {
          current: currentVersion,
          latest: latestVersion,
          name,
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
