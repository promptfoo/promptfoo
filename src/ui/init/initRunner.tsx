/**
 * Entry point for the Ink-based init wizard.
 *
 * This module provides the function to run the interactive init experience.
 *
 * IMPORTANT: This module uses dynamic imports for ink-related components to avoid
 * loading ink/React when promptfoo is used as a library.
 */

import { shouldUseInkInitUI } from '../interactiveCheck';
import { runInkApp } from '../runInkApp';

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
  const [React, { InitApp }] = await Promise.all([import('react'), import('./components/InitApp')]);

  return runInkApp<InitResult>({
    componentName: 'InitApp',
    defaultResult: { success: false },
    signalResult: { success: false, error: 'Cancelled by user' },
    signalContext: 'init',
    render: (resolve) =>
      React.createElement(InitApp, {
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
