/**
 * Utilities for detecting CLI installation method and generating appropriate next commands.
 * Combines multiple detection strategies for robust installer identification.
 */

/**
 * Supported installer types that affect command generation.
 */
export type InstallerType = 'npx' | 'brew' | 'npm-global' | 'unknown';

/**
 * Detects how the CLI was invoked by checking various environment variables and paths.
 * Uses a combination of the original isRunningUnderNpx logic and new detection methods.
 *
 * @returns The detected installer type
 */
export function detectInstaller(): InstallerType {
  // Original detection logic from isRunningUnderNpx - check npm environment variables
  const npmExecPath = process.env.npm_execpath || '';
  const npmLifecycleScript = process.env.npm_lifecycle_script || '';

  // Primary npx detection using original logic
  if (
    (npmExecPath && npmExecPath.includes('npx')) ||
    process.execPath.includes('npx') ||
    (npmLifecycleScript && npmLifecycleScript.includes('npx'))
  ) {
    return 'npx';
  }

  // Additional detection methods
  const prefix = process.env.npm_config_prefix || '';
  const ua = process.env.npm_config_user_agent || '';
  const exec = process.execPath || '';

  // Homebrew detection (works on macOS and Linux)
  if (
    /Homebrew[\/\\]Cellar/i.test(prefix) ||
    /Homebrew[\/\\]Cellar/i.test(exec) ||
    /[\/\\]Homebrew[\/\\]/i.test(prefix) ||
    /[\/\\]Homebrew[\/\\]/i.test(exec)
  ) {
    return 'brew';
  }

  // User agent fallback for npx (useful for testing)
  // npm_config_user_agent='npx/...' node dist/src/main.js init
  if (/\bnpx\/\d+/i.test(ua)) {
    return 'npx';
  }

  // npm global installation
  if (/\bnpm\/\d+/i.test(ua)) {
    return 'npm-global';
  }

  return 'unknown';
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
