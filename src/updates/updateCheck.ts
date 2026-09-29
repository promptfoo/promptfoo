import semver from 'semver';
import { getEnvBool } from '../envars';
import logger from '../logger';
import { getLatestVersion } from '../updates';
import { VERSION } from '../version';
import { getUpdateCommands } from './updateCommands';

interface UpdateInfo {
  current: string;
  latest: string;
  name: string;
}

export interface UpdateObject {
  message: string;
  update: UpdateInfo;
}

interface CheckForUpdatesOptions {
  throwOnError?: boolean;
}

const PACKAGE_NAME = 'promptfoo';
export function getUpdateInstructions(): string {
  const commands = getUpdateCommands({
    isContainer: getEnvBool('PROMPTFOO_RUNNING_IN_DOCKER'),
    isOfficialDockerImage: getEnvBool('PROMPTFOO_OFFICIAL_DOCKER_IMAGE'),
    isNpx: false,
  });
  if (commands.isCustomContainer) {
    return 'Update the Promptfoo source, dependency, or parent image, then rebuild and redeploy the container.';
  }
  if (commands.commandType === 'docker') {
    return `Run ${commands.primary}. For a derived image, update its Promptfoo base, rebuild, and redeploy.`;
  }
  return 'For global npm installations on macOS or Linux, run "promptfoo update". For temporary installations, invoke the latest package (for example, "npx promptfoo@latest"). Otherwise, update with the package manager that installed Promptfoo.';
}

export async function checkForUpdates(
  options: CheckForUpdatesOptions = {},
): Promise<UpdateObject | null> {
  try {
    if (getEnvBool('PROMPTFOO_DISABLE_UPDATE')) {
      return null;
    }

    if (!VERSION) {
      return null;
    }

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
    const message = err instanceof Error ? err.message : String(err);
    logger.debug(`Failed to check for updates: ${message}`);
    return null;
  }
}
