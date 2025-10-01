/**
 * Utilities for detecting CLI installation method and generating appropriate next commands.
 */

import { detectPackageManagerFromEnv, PackageManager } from './installationDetection';

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
  const packageManager = detectPackageManagerFromEnv();

  if (packageManager === PackageManager.NPX) {
    return subcommand ? `npx promptfoo@latest ${subcommand}` : 'npx promptfoo@latest';
  }

  // All other installers use the same format
  return subcommand ? `promptfoo ${subcommand}` : 'promptfoo';
}

/**
 * Legacy function for backwards compatibility.
 * @deprecated Use promptfooCommand() to generate commands instead
 */
export function isRunningUnderNpx(): boolean {
  return detectPackageManagerFromEnv() === PackageManager.NPX;
}
