/**
 * Entry point for the Ink-based cache management UI.
 *
 * IMPORTANT: This module uses dynamic imports for ink-related components to avoid
 * loading ink/React when promptfoo is used as a library.
 */

import logger from '../../logger';
import { shouldUseInkUI } from '../interactiveCheck';

import type { RenderResult } from '../render';
import type { CacheStats } from './CacheApp';

export interface CacheRunnerOptions {
  /** Initial stats */
  stats?: CacheStats;
  /** Callback to get cache stats */
  getStats?: () => Promise<CacheStats>;
  /** Callback to clear cache */
  clearCache?: () => Promise<void>;
}

export interface CacheResult {
  /** Whether any cache was cleared */
  cleared: boolean;
}

/**
 * Check if the Ink-based cache UI should be used.
 * Delegates to the shared opt-in check (PROMPTFOO_ENABLE_INTERACTIVE_UI + TTY).
 */
export function shouldUseInkCache(): boolean {
  return shouldUseInkUI();
}

/**
 * Run the Ink-based cache management UI.
 */
export async function runInkCache(options: CacheRunnerOptions): Promise<CacheResult> {
  // Dynamic imports to avoid loading ink/React when used as library
  const [React, { renderInteractive }, { CacheApp }, { ErrorBoundary }] = await Promise.all([
    import('react'),
    import('../render'),
    import('./CacheApp'),
    import('../components/shared/ErrorBoundary'),
  ]);

  let result: CacheResult = { cleared: false };
  let resolveResult: (result: CacheResult) => void;
  const resultPromise = new Promise<CacheResult>((resolve) => {
    resolveResult = resolve;
  });

  let renderResult: RenderResult | null = null;
  let hasCleared = false;

  try {
    renderResult = await renderInteractive(
      React.createElement(
        ErrorBoundary,
        {
          componentName: 'CacheApp',
          onError: () => {
            result = { cleared: hasCleared };
            resolveResult(result);
          },
        },
        React.createElement(CacheApp, {
          stats: options.stats,
          onRefresh: options.getStats,
          onClear: async () => {
            if (options.clearCache) {
              await options.clearCache();
              hasCleared = true;
            }
          },
          onExit: () => {
            result = { cleared: hasCleared };
            resolveResult(result);
          },
        }),
      ),
      {
        exitOnCtrlC: false,
        patchConsole: true,
        onSignal: (signal: string) => {
          logger.debug(`Received ${signal} signal - exiting cache UI`);
          result = { cleared: hasCleared };
          resolveResult(result);
        },
      },
    );

    result = await Promise.race([resultPromise, renderResult.waitUntilExit().then(() => result)]);

    await new Promise((resolve) => setTimeout(resolve, 100));
  } finally {
    if (renderResult) {
      renderResult.cleanup();
    }
  }

  return result;
}

export type { CacheStats };
