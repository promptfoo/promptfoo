/**
 * Entry point for the Ink-based share UI.
 *
 * IMPORTANT: This module uses dynamic imports for ink-related components to avoid
 * loading ink/React when promptfoo is used as a library.
 */

import logger from '../../logger';
import { shouldUseInkUI } from '../interactiveCheck';

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
 * Delegates to the shared opt-in check (PROMPTFOO_ENABLE_INTERACTIVE_UI + TTY).
 */
export function shouldUseInkShare(): boolean {
  return shouldUseInkUI();
}

/**
 * Initialize the Ink-based share UI.
 */
export async function initInkShare(options: ShareRunnerOptions): Promise<ShareUIResult> {
  // Dynamic imports to avoid loading ink/React when used as library
  const [React, { renderInteractive }, { ShareApp, createShareController }, { ErrorBoundary }] =
    await Promise.all([
      import('react'),
      import('../render'),
      import('./ShareApp'),
      import('../components/shared/ErrorBoundary'),
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
    React.createElement(
      ErrorBoundary,
      {
        componentName: 'ShareApp',
        onError: () => {
          resolveConfirmation(false);
          resolveResult(undefined);
        },
      },
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
    ),
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

  // Race promises against Ink exit to prevent hangs if component crashes
  const safeConfirmation = Promise.race([
    confirmationPromise,
    renderResult.waitUntilExit().then(() => false),
  ]);

  const safeResult = Promise.race([
    resultPromise,
    renderResult.waitUntilExit().then(() => undefined),
  ]);

  return {
    renderResult,
    controller,
    cleanup: () => {
      renderResult.cleanup();
    },
    confirmation: safeConfirmation,
    result: safeResult,
  };
}
