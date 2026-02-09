/**
 * Entry point for the Ink-based redteam init wizard.
 *
 * This module provides the function to run the interactive redteam init experience.
 *
 * IMPORTANT: This module uses dynamic imports for ink-related components to avoid
 * loading ink/React when promptfoo is used as a library.
 */

import logger from '../../logger';
import { shouldUseInkInitUI } from '../interactiveCheck';

import type { RenderResult } from '../render';

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
  // Dynamic imports to avoid loading ink/React when used as library
  const [React, { renderInteractive }, { RedteamInitApp }, { ErrorBoundary }] = await Promise.all([
    import('react'),
    import('../render'),
    import('./components/RedteamInitApp'),
    import('../components/shared/ErrorBoundary'),
  ]);

  // Track result
  let result: RedteamInitResult = { success: false };
  let resolveResult: (result: RedteamInitResult) => void;
  const resultPromise = new Promise<RedteamInitResult>((resolve) => {
    resolveResult = resolve;
  });

  let renderResult: RenderResult | null = null;

  try {
    // Render the app
    renderResult = await renderInteractive(
      React.createElement(
        ErrorBoundary,
        {
          componentName: 'RedteamInitApp',
          onError: (error: Error) => {
            result = { success: false, error: `UI Error: ${error.message}` };
            resolveResult(result);
          },
        },
        React.createElement(RedteamInitApp, {
          directory: options.directory,
          onComplete: (initResult: { directory: string; filesWritten: string[] }) => {
            result = {
              success: true,
              outputDirectory: initResult.directory,
              configPath: `${initResult.directory}/promptfooconfig.yaml`,
              filesWritten: initResult.filesWritten,
            };
            resolveResult(result);
          },
          onCancel: () => {
            result = { success: false, error: 'Cancelled by user' };
            resolveResult(result);
          },
        }),
      ),
      {
        exitOnCtrlC: false,
        patchConsole: true,
        onSignal: (signal: string) => {
          logger.debug(`Received ${signal} signal - cancelling redteam init`);
          result = { success: false, error: `Interrupted by ${signal}` };
          resolveResult(result);
        },
      },
    );

    // Wait for completion
    result = await resultPromise;

    // Brief pause before cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));
  } finally {
    if (renderResult) {
      renderResult.cleanup();
    }
  }

  return result;
}
