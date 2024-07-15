import { Command } from 'commander';
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
      await clearCache();
      cleanupOldFileResults(0);
      telemetry.record('command_used', {
        name: 'cache_clear',
      });
      await telemetry.send();
    });
}
