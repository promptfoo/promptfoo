/**
 * Entry point for the Ink-based init wizard.
 *
 * This module provides the function to run the interactive init experience.
 *
 * IMPORTANT: This module uses dynamic imports for ink-related components to avoid
 * loading ink/React when promptfoo is used as a library.
 */

import { shouldUseInkInitUI } from '../interactiveCheck';

import type { RenderResult } from '../render';

export interface InitRunnerOptions {
  /** Target directory for initialization */
  directory?: string;
  /** Whether to run in interactive mode */
  interactive?: boolean;
  /** Example to download (if specified) */
  example?: string | boolean;
}

export interface InitResult {
  /** Whether init completed successfully */
  success: boolean;
  /** Path to the created config file */
  configPath?: string;
  /** Directory where files were written */
  outputDirectory?: string;
  /** Example that was downloaded (if any) */
  exampleName?: string;
  /** Error message if failed */
  error?: string;
  /** List of files written */
  filesWritten?: string[];
}

/**
 * Check if the Ink-based init UI should be used.
 * Delegates to shouldUseInkInitUI() in interactiveCheck.ts.
 */
export const shouldUseInkInit = shouldUseInkInitUI;

/**
 * Run the Ink-based init wizard.
 */
export async function runInkInit(_options: InitRunnerOptions = {}): Promise<InitResult> {
  // Dynamic imports to avoid loading ink/React when used as library
  const [React, { renderInteractive }, { InitApp }, { ErrorBoundary }] = await Promise.all([
    import('react'),
    import('../render'),
    import('./components/InitApp'),
    import('../components/shared/ErrorBoundary'),
  ]);

  // Track result
  let result: InitResult = { success: false };
  let resolveResult: (result: InitResult) => void;
  const resultPromise = new Promise<InitResult>((resolve) => {
    resolveResult = resolve;
  });

  let renderResult: RenderResult | null = null;

  try {
    // Render the app
    renderResult = await renderInteractive(
      React.createElement(
        ErrorBoundary,
        {
          componentName: 'InitApp',
          onError: (error: Error) => {
            result = { success: false, error: `UI Error: ${error.message}` };
            resolveResult(result);
          },
        },
        React.createElement(InitApp, {
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
          logger.debug(`Received ${signal} signal - cancelling init`);
          result = { success: false, error: `Interrupted by ${signal}` };
          resolveResult(result);
        },
      },
    );

    // Wait for completion, racing against Ink exit in case the component crashes
    result = await Promise.race([resultPromise, renderResult.waitUntilExit().then(() => result)]);

    // Brief pause before cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));
  } finally {
    if (renderResult) {
      renderResult.cleanup();
    }
  }

  return result;
}
