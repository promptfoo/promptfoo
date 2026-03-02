/**
 * Shared helper for initializing Ink apps that return a controller.
 *
 * This eliminates the repeated "init-and-return-controller" boilerplate across runners:
 * dynamic imports → create promises → create controller → render with ErrorBoundary →
 * race promises against waitUntilExit → return controller + cleanup.
 *
 * IMPORTANT: This module uses dynamic imports for ink-related components to avoid
 * loading ink/React when promptfoo is used as a library.
 */

import type { ReactElement } from 'react';

import logger from '../logger';

import type { RenderResult } from './render';

export interface PromiseChannel<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

export interface InitInkAppOptions<TController> {
  /** Name for error boundary reporting */
  componentName: string;
  /** Build the React element tree. Receives resolve functions for each promise channel. */
  render: (resolvers: Record<string, (value: unknown) => void>) => ReactElement;
  /** The controller instance to return */
  controller: TController;
  /** Promise channel definitions: name → fallback value for signal/error */
  channels: Record<string, unknown>;
  /** Log context for signal messages */
  signalContext?: string;
}

export interface InitInkAppResult<TController> {
  /** The Ink render result */
  renderResult: RenderResult;
  /** The controller for sending updates */
  controller: TController;
  /** Cleanup function */
  cleanup: () => void;
  /** Promise channels, raced against waitUntilExit */
  promises: Record<string, Promise<unknown>>;
}

/**
 * Initialize an Ink app and return a controller with promise channels.
 *
 * Handles the full lifecycle: dynamic imports, ErrorBoundary wrapping,
 * signal handling, Promise.race for each channel, and cleanup.
 */
export async function initInkApp<TController>(
  options: InitInkAppOptions<TController>,
): Promise<InitInkAppResult<TController>> {
  const { componentName, controller, channels, signalContext } = options;

  // Dynamic imports to avoid loading ink/React when used as library
  const [React, { renderInteractive }, { ErrorBoundary }] = await Promise.all([
    import('react'),
    import('./render'),
    import('./components/shared/ErrorBoundary'),
  ]);

  // Create promise channels
  const resolvers: Record<string, (value: unknown) => void> = {};
  const rejecters: Record<string, (error: Error) => void> = {};
  const rawPromises: Record<string, Promise<unknown>> = {};

  for (const name of Object.keys(channels)) {
    rawPromises[name] = new Promise((resolve, reject) => {
      resolvers[name] = resolve;
      rejecters[name] = reject;
    });
  }

  const appElement = options.render(resolvers);

  const renderResult = await renderInteractive(
    React.createElement(
      ErrorBoundary,
      {
        componentName,
        onError: (error: Error) => {
          // Reject all channels so callers can fall back to non-interactive paths
          for (const name of Object.keys(channels)) {
            rejecters[name]?.(error);
          }
        },
      },
      appElement,
    ),
    {
      exitOnCtrlC: false,
      patchConsole: true,
      onSignal: (signal: string) => {
        logger.debug(`Received ${signal} signal - cancelling ${signalContext || componentName}`);
        // Resolve all channels with their fallback values
        for (const [name, fallback] of Object.entries(channels)) {
          resolvers[name]?.(fallback);
        }
      },
    },
  );

  // Race each promise against waitUntilExit
  const safePromises: Record<string, Promise<unknown>> = {};
  for (const [name, fallback] of Object.entries(channels)) {
    safePromises[name] = Promise.race([
      rawPromises[name],
      renderResult.waitUntilExit().then(() => fallback),
    ]);
  }

  return {
    renderResult,
    controller,
    cleanup: () => renderResult.cleanup(),
    promises: safePromises,
  };
}
