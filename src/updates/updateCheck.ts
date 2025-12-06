import semver from 'semver';
import { fetchWithTimeout } from '../util/fetch';
import logger from '../logger';
// Use require to load package.json - works reliably in both dev and published package
import packageJson from '../../package.json';

export const FETCH_TIMEOUT_MS = 2000;

export interface UpdateInfo {
  current: string;
  latest: string;
  name: string;
}

export interface UpdateObject {
  message: string;
  update: UpdateInfo;
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

/**
 * Fetch latest version from custom API
 */
async function getLatestVersion(): Promise<string> {
  const response = await fetchWithTimeout(`https://api.promptfoo.dev/api/latestVersion`, {}, 10000);
  if (!response.ok) {
    throw new Error(`Failed to fetch package information for promptfoo`);
  }
  const data = (await response.json()) as { latestVersion: string };
  return data.latestVersion;
}

export async function checkForUpdates(): Promise<UpdateObject | null> {
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
    // Use debug level to avoid spamming users with network errors
    // Don't expose full error object which might contain sensitive info
    const message = err instanceof Error ? err.message : String(err);
    logger.debug(`Failed to check for updates: ${message}`);
    return null;
  }
}
