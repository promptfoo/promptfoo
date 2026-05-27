import semver from 'semver';
import { getEnvBool } from '../envars';
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
  ignoreDisableUpdate?: boolean;
}

const PACKAGE_NAME = 'promptfoo';
export const UPDATE_INSTRUCTIONS =
  'For global installations, run "promptfoo update". For npx, pnpx, or bunx, invoke the latest package directly (for example, "npx promptfoo@latest").';

export async function checkForUpdates(
  options: CheckForUpdatesOptions = {},
): Promise<UpdateObject | null> {
  try {
    if (!options.ignoreDisableUpdate && getEnvBool('PROMPTFOO_DISABLE_UPDATE')) {
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
