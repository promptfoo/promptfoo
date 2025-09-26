import * as fs from 'node:fs';
import * as path from 'node:path';
import * as childProcess from 'node:child_process';

export enum PackageManager {
  NPM = 'npm',
  YARN = 'yarn',
  PNPM = 'pnpm',
  PNPX = 'pnpx',
  BUN = 'bun',
  BUNX = 'bunx',
  HOMEBREW = 'homebrew',
  NPX = 'npx',
  DOCKER = 'docker',
  UNKNOWN = 'unknown',
}

export interface InstallationInfo {
  packageManager: PackageManager;
  isGlobal: boolean;
  updateCommand?: string;
  updateMessage?: string;
}

function isGitRepository(cwd: string): boolean {
  try {
    return fs.existsSync(path.join(cwd, '.git'));
  } catch {
    return false;
  }
}

export function getInstallationInfo(
  projectRoot: string,
  isAutoUpdateDisabled: boolean,
): InstallationInfo {
  const cliPath = process.argv[1];
  if (!cliPath) {
    return { packageManager: PackageManager.UNKNOWN, isGlobal: false };
  }

  try {
    // Normalize path separators to forward slashes for consistent matching.
    const realPath = fs.realpathSync(cliPath).replace(/\\/g, '/');
    const normalizedProjectRoot = projectRoot?.replace(/\\/g, '/');
    const isGit = isGitRepository(process.cwd());

    // Check for Docker environment
    if (process.env.DOCKER === 'true' || fs.existsSync('/.dockerenv')) {
      return {
        packageManager: PackageManager.DOCKER,
        isGlobal: false,
        updateMessage:
          'Running in Docker. Please update with "docker pull promptfoo/promptfoo:latest".',
      };
    }

    // Check for local git clone first
    if (
      isGit &&
      normalizedProjectRoot &&
      realPath.startsWith(normalizedProjectRoot) &&
      !realPath.includes('/node_modules/')
    ) {
      return {
        packageManager: PackageManager.UNKNOWN, // Not managed by a package manager in this sense
        isGlobal: false,
        updateMessage: 'Running from a local git clone. Please update with "git pull".',
      };
    }

    // Check for npx/pnpx
    if (realPath.includes('/.npm/_npx') || realPath.includes('/npm/_npx')) {
      return {
        packageManager: PackageManager.NPX,
        isGlobal: false,
        updateMessage: 'Running via npx, update not applicable.',
      };
    }
    if (realPath.includes('/.pnpm/_pnpx')) {
      return {
        packageManager: PackageManager.PNPX,
        isGlobal: false,
        updateMessage: 'Running via pnpx, update not applicable.',
      };
    }

    // Check for Homebrew
    if (process.platform === 'darwin') {
      try {
        // The package name in homebrew is promptfoo
        childProcess.execSync('brew list -1 | grep -q "^promptfoo$"', {
          stdio: 'ignore',
        });
        return {
          packageManager: PackageManager.HOMEBREW,
          isGlobal: true,
          updateMessage: 'Installed via Homebrew. Please update with "brew upgrade promptfoo".',
        };
      } catch (_error) {
        // Brew is not installed or promptfoo is not installed via brew.
        // Continue to the next check.
      }
    }

    // Check for pnpm
    if (realPath.includes('/.pnpm/global')) {
      const updateCommand = 'pnpm add -g promptfoo@latest';
      return {
        packageManager: PackageManager.PNPM,
        isGlobal: true,
        updateCommand,
        updateMessage: isAutoUpdateDisabled
          ? `Please run ${updateCommand} to update`
          : 'Installed with pnpm. Attempting to automatically update now...',
      };
    }

    // Check for yarn
    if (realPath.includes('/.yarn/global')) {
      const updateCommand = 'yarn global add promptfoo@latest';
      return {
        packageManager: PackageManager.YARN,
        isGlobal: true,
        updateCommand,
        updateMessage: isAutoUpdateDisabled
          ? `Please run ${updateCommand} to update`
          : 'Installed with yarn. Attempting to automatically update now...',
      };
    }

    // Check for bun
    if (realPath.includes('/.bun/install/cache')) {
      return {
        packageManager: PackageManager.BUNX,
        isGlobal: false,
        updateMessage: 'Running via bunx, update not applicable.',
      };
    }
    if (realPath.includes('/.bun/bin')) {
      const updateCommand = 'bun add -g promptfoo@latest';
      return {
        packageManager: PackageManager.BUN,
        isGlobal: true,
        updateCommand,
        updateMessage: isAutoUpdateDisabled
          ? `Please run ${updateCommand} to update`
          : 'Installed with bun. Attempting to automatically update now...',
      };
    }

    // Check for local install
    if (normalizedProjectRoot && realPath.startsWith(`${normalizedProjectRoot}/node_modules`)) {
      let pm = PackageManager.NPM;
      if (fs.existsSync(path.join(projectRoot, 'yarn.lock'))) {
        pm = PackageManager.YARN;
      } else if (fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) {
        pm = PackageManager.PNPM;
      } else if (fs.existsSync(path.join(projectRoot, 'bun.lockb'))) {
        pm = PackageManager.BUN;
      }
      return {
        packageManager: pm,
        isGlobal: false,
        updateMessage: "Locally installed. Please update via your project's package.json.",
      };
    }

    // Assume global npm
    const updateCommand = 'npm install -g promptfoo@latest';
    return {
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand,
      updateMessage: isAutoUpdateDisabled
        ? `Please run ${updateCommand} to update`
        : 'Installed with npm. Attempting to automatically update now...',
    };
  } catch (error) {
    console.log(error);
    return { packageManager: PackageManager.UNKNOWN, isGlobal: false };
  }
}
