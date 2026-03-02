/**
 * Shared helper for running Ink apps that block until a result is available.
 *
 * This eliminates the repeated "run-and-wait" boilerplate across runners:
 * dynamic imports → result promise → ErrorBoundary wrap → render →
 * Promise.race(result, waitUntilExit) → cleanup delay → cleanup.
 *
 * IMPORTANT: This module uses dynamic imports for ink-related components to avoid
 * loading ink/React when promptfoo is used as a library.
 */

import type { ReactElement } from 'react';

import logger from '../logger';

import type { RenderResult } from './render';

export interface RunInkAppOptions<TResult> {
  /** Name for error boundary reporting */
  componentName: string;
  /** Default result returned on error/ErrorBoundary */
  defaultResult: TResult;
  /** Result returned on SIGINT/SIGTERM. Falls back to defaultResult if not set. */
  signalResult?: TResult;
  /** Build the React element tree. Receives a resolve function to signal completion. */
  render: (resolve: (result: TResult) => void) => ReactElement;
  /** Log context for signal messages (e.g., "menu", "list") */
  signalContext?: string;
}

/**
 * Run an Ink app and block until it produces a result.
 *
 * Handles the full lifecycle: dynamic imports, ErrorBoundary wrapping,
 * signal handling, Promise.race against waitUntilExit, and cleanup.
 */
export async function runInkApp<TResult>(options: RunInkAppOptions<TResult>): Promise<TResult> {
  const { componentName, defaultResult, signalResult, signalContext } = options;

  // Dynamic imports to avoid loading ink/React when used as library
  const [React, { renderInteractive }, { ErrorBoundary }] = await Promise.all([
    import('react'),
    import('./render'),
    import('./components/shared/ErrorBoundary'),
  ]);

  let result: TResult = defaultResult;
  let resolveResult: (result: TResult) => void;
  let rejectResult: (error: Error) => void;
  const resultPromise = new Promise<TResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  let renderResult: RenderResult | null = null;

  try {
    const appElement = options.render((r) => {
      result = r;
      resolveResult(r);
    });

    renderResult = await renderInteractive(
      React.createElement(
        ErrorBoundary,
        {
          componentName,
          onError: (error: Error) => {
            rejectResult(error);
          },
        },
        appElement,
      ),
      {
        exitOnCtrlC: false,
        patchConsole: true,
        onSignal: (signal: string) => {
          logger.debug(`Received ${signal} signal - exiting ${signalContext || componentName}`);
          const signalValue = signalResult ?? result;
          result = signalValue;
          resolveResult(signalValue);
        },
      },
    );

    result = await Promise.race([resultPromise, renderResult.waitUntilExit().then(() => result)]);

    // Small delay for clean exit
    await new Promise((resolve) => setTimeout(resolve, 100));
  } finally {
    if (renderResult) {
      renderResult.cleanup();
    }
  }

  return result;
}
