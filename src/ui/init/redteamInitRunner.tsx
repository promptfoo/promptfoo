/**
 * Entry point for the Ink-based redteam init wizard.
 *
 * This module provides the function to run the interactive redteam init experience.
 *
 * IMPORTANT: This module uses dynamic imports for ink-related components to avoid
 * loading ink/React when promptfoo is used as a library.
 */

import { shouldUseInkInitUI } from '../interactiveCheck';
import { runInkApp } from '../runInkApp';

export interface RedteamInitRunnerOptions {
  /** Target directory for initialization */
  directory?: string;
}

export interface RedteamInitResult {
  /** Whether init completed successfully */
  success: boolean;
  /** Path to the created config file */
  configPath?: string;
  /** Directory where files were written */
  outputDirectory?: string;
  /** Error message if failed */
  error?: string;
  /** List of files written */
  filesWritten?: string[];
}

/**
 * Check if the Ink-based redteam init UI should be used.
 * Delegates to shouldUseInkInitUI() in interactiveCheck.ts.
 */
export const shouldUseInkRedteamInit = shouldUseInkInitUI;

/**
 * Run the Ink-based redteam init wizard.
 */
export async function runInkRedteamInit(
  options: RedteamInitRunnerOptions = {},
): Promise<RedteamInitResult> {
  const [React, { RedteamInitApp }] = await Promise.all([
    import('react'),
    import('./components/RedteamInitApp'),
  ]);

  return runInkApp<RedteamInitResult>({
    componentName: 'RedteamInitApp',
    defaultResult: { success: false },
    signalResult: { success: false, error: 'Cancelled by user' },
    signalContext: 'redteam init',
    render: (resolve) =>
      React.createElement(RedteamInitApp, {
        directory: options.directory,
        onComplete: (initResult: { directory: string; filesWritten: string[] }) => {
          resolve({
            success: true,
            outputDirectory: initResult.directory,
            configPath: `${initResult.directory}/promptfooconfig.yaml`,
            filesWritten: initResult.filesWritten,
          });
        },
        onCancel: () => {
          resolve({ success: false, error: 'Cancelled by user' });
        },
      }),
  });
}
