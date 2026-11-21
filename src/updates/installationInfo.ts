import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { parseEnvBool } from '../envars';
import { getUpdateCommands } from './updateCommands';
import { createUpdateContext } from './updateCommandUtils';

type InstallationInfo =
  | { canUpdate: false; message: string }
  | { canUpdate: true; message: string; context: ReturnType<typeof createUpdateContext> };

const MANUAL_UPDATE = 'Update Promptfoo with the package manager that installed it.';

export function isContainerInstallation(sourceEnvironment: NodeJS.ProcessEnv): boolean {
  return (
    parseEnvBool(sourceEnvironment.PROMPTFOO_OFFICIAL_DOCKER_IMAGE) ||
    parseEnvBool(sourceEnvironment.PROMPTFOO_RUNNING_IN_DOCKER) ||
    sourceEnvironment.DOCKER === 'true' ||
    existsSync('/.dockerenv')
  );
}

export function getInstallationInfo(
  projectRoot: string,
  sourceEnvironment: NodeJS.ProcessEnv,
): InstallationInfo {
  const manual = (message: string): InstallationInfo => ({ canUpdate: false, message });
  const isOfficialDockerImage = parseEnvBool(sourceEnvironment.PROMPTFOO_OFFICIAL_DOCKER_IMAGE);
  if (isContainerInstallation(sourceEnvironment)) {
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
    context.npm = realpathSync(context.npm);
    if (!context.npm.endsWith('/npm/bin/npm-cli.js')) {
      return manual(MANUAL_UPDATE);
    }
    // Do not execute a runtime or npm installation supplied by the project.
    for (let dir = realpathSync(projectRoot); dir !== path.dirname(dir); dir = path.dirname(dir)) {
      if (
        (existsSync(path.join(dir, '.git')) || existsSync(path.join(dir, 'package.json'))) &&
        [context.npm, process.execPath].some((file) => file.startsWith(`${dir}/`))
      ) {
        return manual(MANUAL_UPDATE);
      }
    }
    const globalRoot = execFileSync(process.execPath, [context.npm, 'root', '--global'], {
      cwd: context.cwd,
      env: context.env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
    }).trim();
    if (!path.isAbsolute(globalRoot)) {
      return manual(MANUAL_UPDATE);
    }
    const entryDir = path.join(realpathSync(globalRoot), 'promptfoo', 'dist', 'src');
    if (['entrypoint.js', 'main.js'].some((name) => cliPath === path.join(entryDir, name))) {
      return { canUpdate: true, message: 'Global npm installation confirmed.', context };
    }
  } catch {
    // Leave unverified installations to their package manager.
  }
  return manual(MANUAL_UPDATE);
}
