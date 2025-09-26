import semver from 'semver';
import { readFileSync } from 'fs';
import path from 'path';
import { fetchWithTimeout } from '../util/fetch';

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
    // Try to find package.json from the current module
    const packagePath = path.join(__dirname, '../../package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
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
  } catch (e) {
    console.warn('Failed to check for updates: ' + e);
    return null;
  }
}
