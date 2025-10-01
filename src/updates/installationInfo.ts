import * as fs from 'node:fs';
import {
  PackageManager,
  detectPackageManagerFromPath,
  isGitRepository,
} from '../util/installationDetection';

// Re-export for backward compatibility
export { PackageManager };

export interface InstallationInfo {
  packageManager: PackageManager;
  isGlobal: boolean;
  updateCommand?: string;
  updateMessage?: string;
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
    const packageManager = detectPackageManagerFromPath(cliPath, projectRoot);
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
        if (isGit && normalizedProjectRoot && realPath.startsWith(normalizedProjectRoot)) {
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
        // Check if it's global or local
        const isGlobal = realPath.includes('/.pnpm/global');
        if (isGlobal) {
          const updateCommand = 'pnpm add -g promptfoo@latest';
          return {
            packageManager,
            isGlobal: true,
            updateCommand,
            updateMessage: isAutoUpdateDisabled
              ? `Please run ${updateCommand} to update`
              : 'Installed with pnpm. Attempting to automatically update now...',
          };
        }
        return {
          packageManager,
          isGlobal: false,
          updateMessage: "Locally installed. Please update via your project's package.json.",
        };
      }

      case PackageManager.YARN: {
        const isGlobal = realPath.includes('/.yarn/global');
        if (isGlobal) {
          const updateCommand = 'yarn global add promptfoo@latest';
          return {
            packageManager,
            isGlobal: true,
            updateCommand,
            updateMessage: isAutoUpdateDisabled
              ? `Please run ${updateCommand} to update`
              : 'Installed with yarn. Attempting to automatically update now...',
          };
        }
        return {
          packageManager,
          isGlobal: false,
          updateMessage: "Locally installed. Please update via your project's package.json.",
        };
      }

      case PackageManager.BUN: {
        const isGlobal = realPath.includes('/.bun/bin');
        if (isGlobal) {
          const updateCommand = 'bun add -g promptfoo@latest';
          return {
            packageManager,
            isGlobal: true,
            updateCommand,
            updateMessage: isAutoUpdateDisabled
              ? `Please run ${updateCommand} to update`
              : 'Installed with bun. Attempting to automatically update now...',
          };
        }
        return {
          packageManager,
          isGlobal: false,
          updateMessage: "Locally installed. Please update via your project's package.json.",
        };
      }

      case PackageManager.NPM: {
        // Check if it's global or local
        const isLocal =
          normalizedProjectRoot && realPath.startsWith(`${normalizedProjectRoot}/node_modules`);
        if (isLocal) {
          return {
            packageManager,
            isGlobal: false,
            updateMessage: "Locally installed. Please update via your project's package.json.",
          };
        }
        const updateCommand = 'npm install -g promptfoo@latest';
        return {
          packageManager,
          isGlobal: true,
          updateCommand,
          updateMessage: isAutoUpdateDisabled
            ? `Please run ${updateCommand} to update`
            : 'Installed with npm. Attempting to automatically update now...',
        };
      }

      default:
        return { packageManager: PackageManager.UNKNOWN, isGlobal: false };
    }
  } catch (error) {
    console.log(error);
    return { packageManager: PackageManager.UNKNOWN, isGlobal: false };
  }
}
