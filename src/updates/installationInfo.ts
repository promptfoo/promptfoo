import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { parseEnvBool } from '../envars';
import { getUpdateCommands } from './updateCommands';
import { createUpdateContext } from './updateCommandUtils';

export interface InstallationInfo {
  canUpdate: boolean;
  message: string;
}

const MANUAL_UPDATE = 'Update Promptfoo with the package manager that installed it.';

export function getInstallationInfo(
  projectRoot: string,
  sourceEnvironment: NodeJS.ProcessEnv,
): InstallationInfo {
  const manual = (message: string): InstallationInfo => ({ canUpdate: false, message });
  const isOfficialDockerImage = parseEnvBool(sourceEnvironment.PROMPTFOO_OFFICIAL_DOCKER_IMAGE);
  if (
    isOfficialDockerImage ||
    parseEnvBool(sourceEnvironment.PROMPTFOO_RUNNING_IN_DOCKER) ||
    sourceEnvironment.DOCKER === 'true' ||
    existsSync('/.dockerenv')
  ) {
    const commands = getUpdateCommands({ isContainer: true, isOfficialDockerImage, isNpx: false });
    return manual(
      commands.isCustomContainer
        ? 'Update the Promptfoo source, dependency, or parent image, then rebuild and redeploy the container.'
        : `Run ${commands.primary}. For a derived image, update its Promptfoo base, rebuild, and redeploy.`,
    );
  }
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    return manual(MANUAL_UPDATE);
  }
  try {
    if (!process.argv[1]) {
      return manual(MANUAL_UPDATE);
    }
    const cliPath = realpathSync(process.argv[1]);
    if (/\/_npx\//.test(cliPath)) {
      return manual('Run npx promptfoo@latest to use the latest version.');
    }
    if (/\/(?:\.pnpm\/_pnpx|[^/]*pnpm[^/]*\/dlx)\//.test(cliPath)) {
      return manual('Run pnpm dlx promptfoo@latest to use the latest version.');
    }
    if (cliPath.includes('/Cellar/promptfoo/')) {
      return manual('Run brew upgrade promptfoo to update.');
    }
    if (cliPath.includes('/.bun/install/cache/')) {
      return manual('Run bunx promptfoo@latest to use the latest version.');
    }
    if (/\/(?:\.pnpm|pnpm|\.yarn|yarn|\.bun)\//.test(cliPath)) {
      return manual(MANUAL_UPDATE);
    }
    if (!cliPath.includes('/node_modules/')) {
      return manual('For a source checkout, pull the latest changes and rebuild Promptfoo.');
    }
    const context = createUpdateContext(sourceEnvironment, projectRoot);
    try {
      const globalRoot = execFileSync('npm', ['root', '--global'], {
        cwd: context.cwd,
        env: context.env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 1000,
      }).trim();
      const packageRoot = path.join(globalRoot, 'promptfoo');
      if (path.isAbsolute(globalRoot) && cliPath.startsWith(`${packageRoot}/`)) {
        return { canUpdate: true, message: 'Global npm installation confirmed.' };
      }
    } finally {
      context.cleanup();
    }
  } catch {
    // An unverified installation receives instructions, never an automatic replacement.
  }
  return manual(MANUAL_UPDATE);
}
