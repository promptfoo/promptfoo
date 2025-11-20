import * as fs from 'node:fs';
import {
  PackageManager,
  detectPackageManagerFromPath,
  isGitRepository,
} from '../util/installationDetection';
import logger from '../logger';

// Re-export for backward compatibility
export { PackageManager };

export interface InstallationInfo {
  packageManager: PackageManager;
  isGlobal: boolean;
  updateCommand?: string;
  updateMessage?: string;
}

/**
 * Helper to check if a normalized path contains a pattern.
 * Both paths should already be normalized (backslashes → forward slashes).
 * Case-insensitive on Windows.
 */
function normalizedPathContains(normalizedPath: string, pattern: string): boolean {
  if (process.platform === 'win32') {
    return normalizedPath.toLowerCase().includes(pattern.toLowerCase());
  }
  return normalizedPath.includes(pattern);
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
        // Check if it's global or local - support multiple path patterns
        const pnpmHome = process.env.PNPM_HOME?.replace(/\\/g, '/');
        const isGlobal =
          normalizedPathContains(realPath, '/.pnpm/global') ||
          normalizedPathContains(realPath, '/pnpm/global') ||
          (pnpmHome && normalizedPathContains(realPath, pnpmHome));
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
        // Check if it's global or local - support multiple path patterns
        // Unix: ~/.yarn/global, ~/.config/yarn/global
        // Windows: %LOCALAPPDATA%\Yarn\Data\global (case-insensitive)
        const yarnGlobalFolder = process.env.YARN_GLOBAL_FOLDER?.replace(/\\/g, '/');
        const lowerPath = realPath.toLowerCase();
        const isGlobal =
          normalizedPathContains(realPath, '/.yarn/global') ||
          normalizedPathContains(realPath, '/.config/yarn/global') ||
          normalizedPathContains(realPath, '/yarn/global') ||
          lowerPath.includes('/yarn/data/global') || // Windows pattern (case-insensitive)
          (yarnGlobalFolder && normalizedPathContains(realPath, yarnGlobalFolder));
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
        const isGlobal = normalizedPathContains(realPath, '/.bun/bin');
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
    // Silent failure - detection errors shouldn't interrupt normal operation
    logger.debug(
      `Installation detection error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { packageManager: PackageManager.UNKNOWN, isGlobal: false };
  }
}
