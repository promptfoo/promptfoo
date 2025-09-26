import type { UpdateInfo } from 'update-notifier';
import updateNotifier from 'update-notifier';
import semver from 'semver';
import { readFileSync } from 'fs';
import path from 'path';

export const FETCH_TIMEOUT_MS = 2000;

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

    const notifier = updateNotifier({
      pkg: {
        name,
        version: currentVersion,
      },
      updateCheckInterval: 0,
      shouldNotifyInNpmScript: true,
    });

    const updateInfo = await notifier.fetchInfo();

    if (updateInfo && semver.gt(updateInfo.latest, currentVersion)) {
      const message = `Promptfoo update available! ${currentVersion} → ${updateInfo.latest}`;
      return {
        message,
        update: { ...updateInfo, current: currentVersion },
      };
    }

    return null;
  } catch (e) {
    console.warn('Failed to check for updates: ' + e);
    return null;
  }
}