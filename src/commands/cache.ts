import type { Command } from 'commander';
import { clearCache } from '../cache';
import logger from '../logger';
import telemetry from '../telemetry';
import { setupEnv } from '../util';

export function cacheCommand(program: Command) {
  program
    .command('cache')
    .description('Manage cache')
    .command('clear')
    .description('Clear cache')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (cmdObj: { envPath?: string }) => {
      setupEnv(cmdObj.envPath);
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
      } finally {
        clearInterval(interval);
      }

      telemetry.record('command_used', {
        name: 'cache_clear',
      });
      await telemetry.send();
    });
}
