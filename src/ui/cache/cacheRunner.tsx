/**
 * Entry point for the Ink-based cache management UI.
 *
 * IMPORTANT: This module uses dynamic imports for ink-related components to avoid
 * loading ink/React when promptfoo is used as a library.
 */

import { isCI } from '../../envars';
import logger from '../../logger';
import { shouldUseInteractiveUI } from '../interactiveCheck';

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
 *
 * Interactive UI is enabled by default when:
 * - Running in a TTY environment
 * - Not in a CI environment
 *
 * Can be explicitly disabled via PROMPTFOO_DISABLE_INTERACTIVE_UI=true
 * Can be force-enabled in CI via PROMPTFOO_FORCE_INTERACTIVE_UI=true
 */
export function shouldUseInkCache(): boolean {
  // Force enable overrides everything (useful for testing in CI)
  if (process.env.PROMPTFOO_FORCE_INTERACTIVE_UI === 'true') {
    logger.debug('Ink cache force-enabled via PROMPTFOO_FORCE_INTERACTIVE_UI');
    return true;
  }

  // CI environments get non-interactive by default
  if (isCI()) {
    logger.debug('Ink cache disabled in CI environment');
    return false;
  }

  // Use the shared interactive UI check (handles TTY, explicit disable, etc.)
  return shouldUseInteractiveUI();
}

/**
 * Run the Ink-based cache management UI.
 */
export async function runInkCache(options: CacheRunnerOptions): Promise<CacheResult> {
  // Dynamic imports to avoid loading ink/React when used as library
  const [React, { renderInteractive }, { CacheApp }] = await Promise.all([
    import('react'),
    import('../render'),
    import('./CacheApp'),
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

    result = await resultPromise;

    await new Promise((resolve) => setTimeout(resolve, 100));
  } finally {
    if (renderResult) {
      renderResult.cleanup();
    }
  }

  return result;
}

export type { CacheStats };
