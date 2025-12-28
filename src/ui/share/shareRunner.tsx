/**
 * Entry point for the Ink-based share UI.
 *
 * IMPORTANT: This module uses dynamic imports for ink-related components to avoid
 * loading ink/React when promptfoo is used as a library.
 */

import { isCI } from '../../envars';
import logger from '../../logger';
import { shouldUseInteractiveUI } from '../interactiveCheck';

import type { RenderResult } from '../render';
import type { ShareController } from './ShareApp';

export interface ShareRunnerOptions {
  /** Eval ID to share */
  evalId: string;
  /** Eval description */
  description?: string;
  /** Number of results */
  resultCount?: number;
  /** Skip confirmation prompt */
  skipConfirmation?: boolean;
}

export interface ShareUIResult {
  /** Render result for cleanup */
  renderResult: RenderResult;
  /** Controller for sending progress updates */
  controller: ShareController;
  /** Cleanup function */
  cleanup: () => void;
  /** Promise that resolves when user confirms or cancels */
  confirmation: Promise<boolean>;
  /** Promise that resolves with share URL or undefined if cancelled */
  result: Promise<string | undefined>;
}

/**
 * Check if the Ink-based share UI should be used.
 *
 * Interactive UI is enabled by default when:
 * - Running in a TTY environment
 * - Not in a CI environment
 *
 * Can be explicitly disabled via PROMPTFOO_DISABLE_INTERACTIVE_UI=true
 * Can be force-enabled in CI via PROMPTFOO_FORCE_INTERACTIVE_UI=true
 */
export function shouldUseInkShare(): boolean {
  // Force enable overrides everything (useful for testing in CI)
  if (process.env.PROMPTFOO_FORCE_INTERACTIVE_UI === 'true') {
    logger.debug('Ink share force-enabled via PROMPTFOO_FORCE_INTERACTIVE_UI');
    return true;
  }

  // CI environments get non-interactive by default
  if (isCI()) {
    logger.debug('Ink share disabled in CI environment');
    return false;
  }

  // Use the shared interactive UI check (handles TTY, explicit disable, etc.)
  return shouldUseInteractiveUI();
}

/**
 * Initialize the Ink-based share UI.
 */
export async function initInkShare(options: ShareRunnerOptions): Promise<ShareUIResult> {
  // Dynamic imports to avoid loading ink/React when used as library
  const [React, { renderInteractive }, { ShareApp, createShareController }] = await Promise.all([
    import('react'),
    import('../render'),
    import('./ShareApp'),
  ]);

  let resolveConfirmation: (confirmed: boolean) => void;
  const confirmationPromise = new Promise<boolean>((resolve) => {
    resolveConfirmation = resolve;
  });

  let resolveResult: (url: string | undefined) => void;
  const resultPromise = new Promise<string | undefined>((resolve) => {
    resolveResult = resolve;
  });

  const controller = createShareController();

  const renderResult = await renderInteractive(
    React.createElement(ShareApp, {
      evalId: options.evalId,
      description: options.description,
      resultCount: options.resultCount,
      skipConfirmation: options.skipConfirmation,
      onConfirm: () => {
        resolveConfirmation(true);
      },
      onCancel: () => {
        resolveConfirmation(false);
        resolveResult(undefined);
      },
      onComplete: (shareUrl: string) => {
        resolveResult(shareUrl);
      },
    }),
    {
      exitOnCtrlC: false,
      patchConsole: true,
      onSignal: (signal: string) => {
        logger.debug(`Received ${signal} signal - cancelling share`);
        resolveConfirmation(false);
        resolveResult(undefined);
      },
    },
  );

  return {
    renderResult,
    controller,
    cleanup: () => {
      renderResult.cleanup();
    },
    confirmation: confirmationPromise,
    result: resultPromise,
  };
}
