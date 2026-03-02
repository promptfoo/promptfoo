/**
 * Entry point for the Ink-based cache management UI.
 *
 * IMPORTANT: This module uses dynamic imports for ink-related components to avoid
 * loading ink/React when promptfoo is used as a library.
 */

export { shouldUseInkUI as shouldUseInkCache } from '../interactiveCheck';

import { runInkApp } from '../runInkApp';

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
 * Run the Ink-based cache management UI.
 */
export async function runInkCache(options: CacheRunnerOptions): Promise<CacheResult> {
  let hasCleared = false;

  const [React, { CacheApp }] = await Promise.all([import('react'), import('./CacheApp')]);

  return runInkApp<CacheResult>({
    componentName: 'CacheApp',
    defaultResult: { cleared: false },
    signalContext: 'cache UI',
    render: (resolve) =>
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
          resolve({ cleared: hasCleared });
        },
      }),
  });
}

export type { CacheStats };
