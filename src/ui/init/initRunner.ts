/**
 * Entry point for the Ink-based init wizard.
 *
 * IMPORTANT: This module uses dynamic imports for ink-related components to avoid
 * loading ink/React when promptfoo is used as a library.
 *
 * NOTE: Interactive UI is OPT-IN. It will only be used if explicitly enabled via
 * PROMPTFOO_ENABLE_INTERACTIVE_UI=true environment variable.
 */

import logger from '../../logger';
import { shouldUseInkUI } from '../interactiveCheck';

import type { RenderResult } from '../render';
import type { InitResult, InitRunnerOptions } from './types';

/**
 * Check if the Ink-based init wizard should be used.
 *
 * Interactive UI is OPT-IN. It will only be used if:
 * 1. User explicitly enabled it via PROMPTFOO_ENABLE_INTERACTIVE_UI=true
 * 2. Running in a TTY environment (stdout.isTTY)
 */
export function shouldUseInkInit(): boolean {
  return shouldUseInkUI();
}

/**
 * Run the Ink-based init wizard.
 *
 * @param options - Wizard options including target directory
 * @returns Result containing wizard selections or cancelled status
 */
export async function runInkInit(options: InitRunnerOptions): Promise<InitResult> {
  // Dynamic imports to avoid loading ink/React when used as library
  const [React, { renderInteractive }, { InitWizard }] = await Promise.all([
    import('react'),
    import('../render'),
    import('./InitWizard'),
  ]);

  let result: InitResult = {
    numPrompts: 0,
    providerPrefixes: [],
    action: '',
    language: '',
    cancelled: false,
  };

  let resolveResult: (result: InitResult) => void;
  const resultPromise = new Promise<InitResult>((resolve) => {
    resolveResult = resolve;
  });

  let renderResult: RenderResult | null = null;

  try {
    renderResult = await renderInteractive(
      React.createElement(InitWizard, {
        directory: options.directory,
        onComplete: (r: InitResult) => {
          result = { ...r, cancelled: false };
          resolveResult(result);
        },
        onExit: () => {
          result = { ...result, cancelled: true };
          resolveResult(result);
        },
      }),
      {
        exitOnCtrlC: false,
        patchConsole: true,
        onSignal: (signal: string) => {
          logger.debug(`Received ${signal} signal - cancelling init wizard`);
          result = { ...result, cancelled: true };
          resolveResult(result);
        },
      },
    );

    result = await resultPromise;

    // Small delay to allow Ink to clean up properly
    await new Promise((resolve) => setTimeout(resolve, 100));
  } finally {
    if (renderResult) {
      renderResult.cleanup();
    }
  }

  return result;
}

export type { InitResult, InitRunnerOptions };
