/**
 * Shared installation detection utilities used across promptfoo.
 * Combines path-based detection (for updates) and env-based detection (for command generation).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as childProcess from 'node:child_process';

export const PackageManager = {
  NPM: 'npm',
  YARN: 'yarn',
  PNPM: 'pnpm',
  PNPX: 'pnpx',
  BUN: 'bun',
  BUNX: 'bunx',
  HOMEBREW: 'homebrew',
  NPX: 'npx',
  DOCKER: 'docker',
  UNKNOWN: 'unknown',
} as const;

export type PackageManager = (typeof PackageManager)[keyof typeof PackageManager];

/**
 * Helper function to check if a path contains a pattern.
 * Normalizes both paths for cross-platform compatibility:
 * - Converts backslashes to forward slashes
 * - Case-insensitive comparison on Windows
 */
export function pathContains(haystack: string, needle: string): boolean {
  // Normalize both paths: replace backslashes with forward slashes
  const normalizedHaystack = haystack.replace(/\\/g, '/');
  const normalizedNeedle = needle.replace(/\\/g, '/');

  if (process.platform === 'win32') {
    return normalizedHaystack.toLowerCase().includes(normalizedNeedle.toLowerCase());
  }
  return normalizedHaystack.includes(normalizedNeedle);
}

/**
 * Check if running in a git repository
 */
export function isGitRepository(cwd: string): boolean {
  try {
    return fs.existsSync(path.join(cwd, '.git'));
  } catch {
    return false;
  }
}

/**
 * Detects package manager from environment variables (fast, for command generation).
 * This is useful for showing users what command to run.
 */
export function detectPackageManagerFromEnv(): PackageManager {
  const npmExecPath = process.env.npm_execpath || '';
  const npmLifecycleScript = process.env.npm_lifecycle_script || '';
  const npmConfigPrefix = process.env.npm_config_prefix || '';
  const npmConfigUserAgent = process.env.npm_config_user_agent || '';
  const execPath = process.execPath || '';

  // NPX detection
  if (
    (npmExecPath && npmExecPath.includes('npx')) ||
    execPath.includes('npx') ||
    (npmLifecycleScript && npmLifecycleScript.includes('npx')) ||
    /\bnpx\/\d+/i.test(npmConfigUserAgent)
  ) {
    return PackageManager.NPX;
  }

  // Homebrew detection
  if (
    /Homebrew[\/\\]Cellar/i.test(npmConfigPrefix) ||
    /Homebrew[\/\\]Cellar/i.test(execPath) ||
    /[\/\\]Homebrew[\/\\]/i.test(npmConfigPrefix) ||
    /[\/\\]Homebrew[\/\\]/i.test(execPath)
  ) {
    return PackageManager.HOMEBREW;
  }

  // NPM global
  if (/\bnpm\/\d+/i.test(npmConfigUserAgent)) {
    return PackageManager.NPM;
  }

  return PackageManager.UNKNOWN;
}

/**
 * Detects package manager from file paths (comprehensive, for update logic).
 * This examines the actual CLI path to determine installation method.
 */
export function detectPackageManagerFromPath(cliPath: string, projectRoot: string): PackageManager {
  try {
    // Normalize path separators to forward slashes for consistent matching
    const realPath = fs.realpathSync(cliPath).replace(/\\/g, '/');
    const normalizedProjectRoot = projectRoot?.replace(/\\/g, '/');
    const isGit = isGitRepository(process.cwd());

    // Check for Docker environment
    if (process.env.DOCKER === 'true' || fs.existsSync('/.dockerenv')) {
      return PackageManager.DOCKER;
    }

    // Check for local git clone first
    if (
      isGit &&
      normalizedProjectRoot &&
      realPath.startsWith(normalizedProjectRoot) &&
      !pathContains(realPath, '/node_modules/')
    ) {
      return PackageManager.UNKNOWN; // Git clone, not managed by package manager
    }

    // Check for npx/pnpx
    if (pathContains(realPath, '/.npm/_npx') || pathContains(realPath, '/npm/_npx')) {
      return PackageManager.NPX;
    }
    if (pathContains(realPath, '/.pnpm/_pnpx')) {
      return PackageManager.PNPX;
    }

    // Check for Homebrew (only on macOS)
    // Note: We use sync here because this is called during initialization
    // The performance impact is minimal as it only runs on macOS during startup
    if (process.platform === 'darwin') {
      try {
        childProcess.execSync('brew list -1 | grep -q "^promptfoo$"', {
          stdio: 'ignore',
          timeout: 1000, // 1 second timeout to prevent hanging
        });
        return PackageManager.HOMEBREW;
      } catch {
        // Not installed via brew, continue checking
      }
    }

    // Check for pnpm global - support multiple path patterns
    if (
      pathContains(realPath, '/.pnpm/global') ||
      pathContains(realPath, '/pnpm/global') ||
      (process.env.PNPM_HOME && pathContains(realPath, process.env.PNPM_HOME))
    ) {
      return PackageManager.PNPM;
    }

    // Check for yarn global - support multiple path patterns
    // Unix: ~/.yarn/global, ~/.config/yarn/global
    // Windows: %LOCALAPPDATA%\Yarn\Data\global (case-insensitive match needed)
    const lowerPath = realPath.toLowerCase();
    if (
      pathContains(realPath, '/.yarn/global') ||
      pathContains(realPath, '/.config/yarn/global') ||
      pathContains(realPath, '/yarn/global') ||
      lowerPath.includes('/yarn/data/global') || // Windows: case-insensitive for Yarn/Data
      (process.env.YARN_GLOBAL_FOLDER && pathContains(realPath, process.env.YARN_GLOBAL_FOLDER))
    ) {
      return PackageManager.YARN;
    }

    // Check for bun
    if (pathContains(realPath, '/.bun/install/cache')) {
      return PackageManager.BUNX;
    }
    if (pathContains(realPath, '/.bun/bin')) {
      return PackageManager.BUN;
    }

    // Check for local install
    if (normalizedProjectRoot && realPath.startsWith(`${normalizedProjectRoot}/node_modules`)) {
      // Detect which package manager based on lock files
      if (fs.existsSync(path.join(projectRoot, 'yarn.lock'))) {
        return PackageManager.YARN;
      } else if (fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) {
        return PackageManager.PNPM;
      } else if (fs.existsSync(path.join(projectRoot, 'bun.lockb'))) {
        return PackageManager.BUN;
      }
      return PackageManager.NPM;
    }

    // Default to npm
    return PackageManager.NPM;
  } catch {
    return PackageManager.UNKNOWN;
  }
}
