import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';

import logger from '../logger';
import {
  detectPackageManagerFromPath,
  findLocalInstallationRoot,
  isGitRepository,
  PackageManager,
  pathContains,
  pathStartsWith,
} from '../util/installationDetection';
import {
  getPackageManagerExecutable,
  getUpdateSpawnContext,
  parseUpdateCommandForSpawn,
} from './updateCommandUtils';

// Re-export for backward compatibility
export { PackageManager };

export interface InstallationInfo {
  packageManager: PackageManager;
  isGlobal: boolean;
  updateCommand?: string;
  updateMessage?: string;
}

const LOCAL_INSTALL_MESSAGE = "Locally installed. Please update via your project's package.json.";
const UNCONFIRMED_NPM_INSTALL_MESSAGE =
  'Unable to confirm a global npm installation. Please update promptfoo through the package manager that installed it.';

function localInstallationInfo(packageManager: PackageManager): InstallationInfo {
  return {
    packageManager,
    isGlobal: false,
    updateMessage: LOCAL_INSTALL_MESSAGE,
  };
}

function globalInstallationInfo(
  packageManager: PackageManager,
  packageManagerName: string,
  updateCommand: string,
  isAutoUpdateDisabled: boolean,
): InstallationInfo {
  return {
    packageManager,
    isGlobal: true,
    updateCommand,
    updateMessage: isAutoUpdateDisabled
      ? `Please run ${updateCommand} to update`
      : `Installed with ${packageManagerName}. Attempting to automatically update now...`,
  };
}

function getPnpmInstallationInfo(
  realPath: string,
  projectRoot: string,
  isAutoUpdateDisabled: boolean,
  sourceEnvironment: NodeJS.ProcessEnv,
): InstallationInfo {
  if (findLocalInstallationRoot(realPath, projectRoot)) {
    return localInstallationInfo(PackageManager.PNPM);
  }

  const pnpmHome = sourceEnvironment.PNPM_HOME;
  const isGlobal =
    pathContains(realPath, '/.pnpm/global') ||
    pathContains(realPath, '/pnpm/global') ||
    Boolean(pnpmHome && pathContains(realPath, pnpmHome));

  return isGlobal
    ? globalInstallationInfo(
        PackageManager.PNPM,
        'pnpm',
        `${getPackageManagerExecutable('pnpm')} add -g promptfoo@latest`,
        isAutoUpdateDisabled,
      )
    : localInstallationInfo(PackageManager.PNPM);
}

function getYarnInstallationInfo(
  realPath: string,
  projectRoot: string,
  isAutoUpdateDisabled: boolean,
  sourceEnvironment: NodeJS.ProcessEnv,
): InstallationInfo {
  if (findLocalInstallationRoot(realPath, projectRoot)) {
    return localInstallationInfo(PackageManager.YARN);
  }

  const yarnGlobalFolder = sourceEnvironment.YARN_GLOBAL_FOLDER;
  const isGlobal =
    pathContains(realPath, '/.yarn/global') ||
    pathContains(realPath, '/.config/yarn/global') ||
    pathContains(realPath, '/yarn/global') ||
    pathContains(realPath, '/yarn/data/global') ||
    Boolean(yarnGlobalFolder && pathContains(realPath, yarnGlobalFolder));

  return isGlobal
    ? globalInstallationInfo(
        PackageManager.YARN,
        'yarn',
        `${getPackageManagerExecutable('yarn')} global add promptfoo@latest`,
        isAutoUpdateDisabled,
      )
    : localInstallationInfo(PackageManager.YARN);
}

function getBunInstallationInfo(
  realPath: string,
  projectRoot: string,
  isAutoUpdateDisabled: boolean,
): InstallationInfo {
  if (findLocalInstallationRoot(realPath, projectRoot)) {
    return localInstallationInfo(PackageManager.BUN);
  }

  return pathContains(realPath, '/.bun/bin') || pathContains(realPath, '/.bun/install/global/')
    ? globalInstallationInfo(
        PackageManager.BUN,
        'bun',
        `${getPackageManagerExecutable('bun')} add -g promptfoo@latest`,
        isAutoUpdateDisabled,
      )
    : localInstallationInfo(PackageManager.BUN);
}

function getNpmInstallationInfo(
  realPath: string,
  projectRoot: string,
  isAutoUpdateDisabled: boolean,
  sourceEnvironment: NodeJS.ProcessEnv,
): InstallationInfo {
  if (findLocalInstallationRoot(realPath, projectRoot)) {
    return localInstallationInfo(PackageManager.NPM);
  }

  try {
    const npmExecutable = getPackageManagerExecutable('npm');
    const { command, args } = parseUpdateCommandForSpawn(
      `${npmExecutable} root --global`,
      sourceEnvironment,
    );
    const globalRoot = execFileSync(command, args, {
      ...getUpdateSpawnContext(sourceEnvironment),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
    })
      .trim()
      .replace(/[\\/]+$/, '');

    if (globalRoot && pathStartsWith(realPath, `${globalRoot}/promptfoo`)) {
      return globalInstallationInfo(
        PackageManager.NPM,
        'npm',
        `${npmExecutable} install -g promptfoo@latest`,
        isAutoUpdateDisabled,
      );
    }
  } catch {
    // Fall through to the fail-closed result below.
  }

  return {
    packageManager: PackageManager.NPM,
    isGlobal: false,
    updateMessage: UNCONFIRMED_NPM_INSTALL_MESSAGE,
  };
}

export function getInstallationInfo(
  projectRoot: string,
  isAutoUpdateDisabled: boolean,
  sourceEnvironment: NodeJS.ProcessEnv = process.env,
): InstallationInfo {
  const cliPath = process.argv[1];
  if (!cliPath) {
    return { packageManager: PackageManager.UNKNOWN, isGlobal: false };
  }

  try {
    const packageManager = detectPackageManagerFromPath(cliPath, projectRoot, sourceEnvironment);
    const isGit = isGitRepository(process.cwd());
    const normalizedProjectRoot = projectRoot?.replace(/\\/g, '/');
    const realPath = fs.realpathSync(cliPath).replace(/\\/g, '/');

    // Build installation info based on detected package manager
    switch (packageManager) {
      case PackageManager.DOCKER:
        return {
          packageManager,
          isGlobal: false,
          updateMessage:
            'Running in Docker. Please update with "docker pull promptfoo/promptfoo:latest".',
        };

      case PackageManager.UNKNOWN:
        // Check if it's a git clone
        if (isGit && normalizedProjectRoot && pathStartsWith(realPath, normalizedProjectRoot)) {
          return {
            packageManager,
            isGlobal: false,
            updateMessage: 'Running from a local git clone. Please update with "git pull".',
          };
        }
        return { packageManager, isGlobal: false };

      case PackageManager.NPX:
        return {
          packageManager,
          isGlobal: false,
          updateMessage: 'Running via npx, update not applicable.',
        };

      case PackageManager.PNPX:
        return {
          packageManager,
          isGlobal: false,
          updateMessage: 'Running via pnpx, update not applicable.',
        };

      case PackageManager.BUNX:
        return {
          packageManager,
          isGlobal: false,
          updateMessage: 'Running via bunx, update not applicable.',
        };

      case PackageManager.HOMEBREW:
        return {
          packageManager,
          isGlobal: true,
          updateMessage: 'Installed via Homebrew. Please update with "brew upgrade promptfoo".',
        };

      case PackageManager.PNPM: {
        return getPnpmInstallationInfo(
          realPath,
          projectRoot,
          isAutoUpdateDisabled,
          sourceEnvironment,
        );
      }

      case PackageManager.YARN: {
        return getYarnInstallationInfo(
          realPath,
          projectRoot,
          isAutoUpdateDisabled,
          sourceEnvironment,
        );
      }

      case PackageManager.BUN: {
        return getBunInstallationInfo(realPath, projectRoot, isAutoUpdateDisabled);
      }

      case PackageManager.NPM: {
        return getNpmInstallationInfo(
          realPath,
          projectRoot,
          isAutoUpdateDisabled,
          sourceEnvironment,
        );
      }

      default:
        return { packageManager: PackageManager.UNKNOWN, isGlobal: false };
    }
  } catch (error) {
    // Silent failure - detection errors shouldn't interrupt normal operation
    logger.debug(
      `Installation detection error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { packageManager: PackageManager.UNKNOWN, isGlobal: false };
  }
}
