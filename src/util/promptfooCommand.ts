/**
 * Utilities for detecting CLI installation method and generating appropriate next commands.
 */

import { detectPackageManagerFromEnv, PackageManager } from './installationDetection';

/**
 * Supported installer types that affect command generation.
 */
export type InstallerType = 'npx' | 'brew' | 'npm-global' | 'unknown';

/**
 * Detects how the CLI was invoked by checking various environment variables.
 * Uses shared detection logic from installationDetection.ts.
 *
 * @returns The detected installer type
 */
export function detectInstaller(): InstallerType {
  const pm = detectPackageManagerFromEnv();

  switch (pm) {
    case PackageManager.NPX:
      return 'npx';
    case PackageManager.HOMEBREW:
      return 'brew';
    case PackageManager.NPM:
      return 'npm-global';
    default:
      return 'unknown';
  }
}

/**
 * Builds the appropriate promptfoo command based on how the CLI was installed.
 * Automatically adds the correct prefix (npx, etc.) for the user's environment.
 *
 * @param subcommand - The subcommand to run (e.g., 'eval', 'redteam init', or '' for just the base command)
 * @returns The complete promptfoo command string ready to run
 *
 * @example
 * ```typescript
 * // For npx users: "npx promptfoo@latest eval"
 * // For others: "promptfoo eval"
 * const cmd = promptfooCommand('eval');
 *
 * // For npx users: "npx promptfoo@latest"
 * // For others: "promptfoo"
 * const baseCmd = promptfooCommand('');
 *
 * // Complex subcommands work too
 * const redteamCmd = promptfooCommand('redteam init --plugins harmful');
 * ```
 */
export function promptfooCommand(subcommand: string): string {
  const installer = detectInstaller();

  if (installer === 'npx') {
    return subcommand ? `npx promptfoo@latest ${subcommand}` : 'npx promptfoo@latest';
  }

  // All other installers use the same format
  return subcommand ? `promptfoo ${subcommand}` : 'promptfoo';
}

/**
 * Legacy function for backwards compatibility.
 * @deprecated Use detectInstaller() instead
 */
export function isRunningUnderNpx(): boolean {
  return detectInstaller() === 'npx';
}
