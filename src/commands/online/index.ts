import { z } from 'zod';
import logger from '../../logger';
import { configureCapture, runCapture } from './capture';
import { onlineDirectory } from './store';
import { runOnlineWorker } from './worker';
import type { Command } from 'commander';

export function onlineCommand(program: Command) {
  const online = program.command('online').description('Evaluate captured live Agent turns');
  // The shipped and local entrypoints dispatch capture before loading the main CLI.
  // Register it here as well so help and direct main.js invocations remain consistent.
  configureCapture(online.command('capture')).action(async (payload, options) => {
    await runCapture([
      '--agent',
      options.agent,
      '--dir',
      options.dir,
      ...(payload === undefined ? [] : [payload]),
    ]);
  });
  online
    .command('watch')
    .description('Grade queued turns and save standard eval records and JSON/HTML reports')
    .requiredOption('-c, --config <path>', 'Trusted configuration containing defaultTest.assert')
    .option('--dir <path>', 'Private local queue directory', onlineDirectory())
    .option('--once', 'Process the current queue and exit', false)
    .option('--retry-errors', 'Retry each previously errored event once', false)
    .option('--interval <ms>', 'Polling interval in milliseconds', '1000')
    .action(async (options) => {
      const controller = new AbortController();
      const stop = () => controller.abort();
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
      try {
        const interval = z.coerce.number().int().min(100).max(60_000).parse(options.interval);
        await runOnlineWorker({
          directory: options.dir,
          configPath: options.config,
          once: options.once,
          retryErrors: options.retryErrors,
          interval,
          signal: controller.signal,
        });
      } catch (error) {
        logger.error('Online eval worker failed', { error });
        process.exitCode = 1;
      } finally {
        process.removeListener('SIGINT', stop);
        process.removeListener('SIGTERM', stop);
      }
    });
}
