import type { Command } from 'commander';
import { clearCache } from '../cache';
import logger from '../logger';
import telemetry from '../telemetry';
import { setupEnv } from '../util';
import { cleanupOldFileResults } from '../util';

export function cacheCommand(program: Command) {
  program
    .command('cache')
    .description('Manage cache')
    .command('clear')
    .description('Clear cache')
    .option('--env-file <path>', 'Path to .env file')
    .action(async (cmdObj: { envFile?: string }) => {
      setupEnv(cmdObj.envFile);
      telemetry.maybeShowNotice();
      logger.info('Clearing cache...');

      const cuteMessages = [
        'Scrubbing bits...',
        'Sweeping stale data...',
        'Defragmenting memory...',
        'Flushing temporary files...',
        'Clearing browser history...',
        'Purging expired entries...',
        'Resetting cache counters...',
        'Pruning the neural net...',
        'Removing overfitting...',
        'Invalidating cached queries...',
        'Refreshing data structures...',
      ];

      let messageIndex = 0;
      const interval = setInterval(() => {
        logger.info(cuteMessages[messageIndex % cuteMessages.length]);
        messageIndex++;
      }, 10000);

      try {
        await clearCache();
        cleanupOldFileResults(0);
      } finally {
        clearInterval(interval);
      }

      telemetry.record('command_used', {
        name: 'cache_clear',
      });
      await telemetry.send();
    });
}
