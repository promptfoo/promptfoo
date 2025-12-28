import * as fs from 'fs';
import * as path from 'path';

import { clearCache, isCacheEnabled } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import { type CacheStats, runInkCache, shouldUseInkCache } from '../ui/cache';
import { getConfigDirectoryPath } from '../util/config/manage';
import { setupEnv } from '../util/index';
import type { Command } from 'commander';

/**
 * Get cache statistics by reading the cache file.
 */
async function getCacheStats(): Promise<CacheStats> {
  const cachePath =
    getEnvString('PROMPTFOO_CACHE_PATH') || path.join(getConfigDirectoryPath(), 'cache');
  const cacheFile = path.join(cachePath, 'cache.json');

  let totalSize = 0;
  let itemCount = 0;

  try {
    if (fs.existsSync(cacheFile)) {
      const stats = fs.statSync(cacheFile);
      totalSize = stats.size;

      // Count items in the cache JSON
      const content = fs.readFileSync(cacheFile, 'utf8');
      const cacheData = JSON.parse(content);
      itemCount = Object.keys(cacheData).length;
    }
  } catch (err) {
    logger.debug(`Error reading cache stats: ${(err as Error).message}`);
  }

  return {
    totalSize,
    itemCount,
    cachePath,
    enabled: isCacheEnabled(),
  };
}

export function cacheCommand(program: Command) {
  const cacheCmd = program.command('cache').description('Manage cache');

  // Interactive cache management
  cacheCmd
    .command('manage')
    .description('Interactive cache management')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (cmdObj: { envPath?: string }) => {
      setupEnv(cmdObj.envPath);

      if (!shouldUseInkCache()) {
        logger.info('Interactive cache UI not available (non-TTY or CI environment).');
        logger.info('Use "promptfoo cache clear" to clear the cache.');
        return;
      }

      await runInkCache({
        getStats: getCacheStats,
        clearCache: async () => {
          await clearCache();
        },
      });
    });

  // Clear cache
  cacheCmd
    .command('clear')
    .description('Clear cache')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .option('--no-interactive', 'Disable interactive UI')
    .action(async (cmdObj: { envPath?: string; interactive: boolean }) => {
      setupEnv(cmdObj.envPath);

      // Use Ink UI by default (unless --no-interactive is specified)
      if (cmdObj.interactive && shouldUseInkCache()) {
        await runInkCache({
          getStats: getCacheStats,
          clearCache: async () => {
            await clearCache();
          },
        });
        return;
      }

      logger.info('Clearing cache...');

      const cuteMessages = [
        'Scrubbing bits...',
        'Sweeping stale data...',
        'Defragmenting memory...',
        'Flushing temporary files...',
        'Tuning hyperparameters...',
        'Purging expired entries...',
        'Resetting cache counters...',
        'Pruning the neural net...',
        'Removing overfitting...',
        'Invalidating cached queries...',
        'Aligning embeddings...',
        'Refreshing data structures...',
      ];

      let messageIndex = 0;
      const interval = setInterval(() => {
        logger.info(cuteMessages[messageIndex % cuteMessages.length]);
        messageIndex++;
      }, 8000);

      try {
        await clearCache();
        logger.info('Cache cleared successfully.');
      } finally {
        clearInterval(interval);
      }
    });

  // Show cache stats
  cacheCmd
    .command('stats')
    .description('Show cache statistics')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (cmdObj: { envPath?: string }) => {
      setupEnv(cmdObj.envPath);

      const stats = await getCacheStats();

      logger.info(`Cache Path: ${stats.cachePath}`);
      logger.info(`Status: ${stats.enabled ? 'Enabled' : 'Disabled'}`);
      logger.info(`Total Size: ${formatBytes(stats.totalSize)}`);
      logger.info(`Items: ${stats.itemCount.toLocaleString()}`);
    });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 B';
  }
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
