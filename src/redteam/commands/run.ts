import type { Command } from 'commander';
import { z } from 'zod';
import cliState from '../../cliState';
import logger, { setLogLevel } from '../../logger';
import telemetry from '../../telemetry';
import { setupEnv } from '../../util';
import { getConfigFromCloud } from '../../util/cloud';
import { doRedteamRun } from '../shared';
import type { RedteamRunOptions } from '../types';
import { poisonCommand } from './poison';

export function redteamRunCommand(program: Command) {
  program
    .command('run')
    .description('Run red teaming process (init, generate, and evaluate)')
    .option('-i, --id <cloudId>', 'Id of the configuration file from the cloud')
    .option('-c, --config [path]', 'Path to configuration file. Defaults to promptfooconfig.yaml')
    .option(
      '-o, --output [path]',
      'Path to output file for generated tests. Defaults to redteam.yaml',
    )
    .option('--no-cache', 'Do not read or write results to disk cache', false)
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .option('-j, --max-concurrency <number>', 'Maximum number of concurrent API calls', (val) =>
      Number.parseInt(val, 10),
    )
    .option('--delay <number>', 'Delay in milliseconds between API calls', (val) =>
      Number.parseInt(val, 10),
    )
    .option('--remote', 'Force remote inference wherever possible', false)
    .option('--force', 'Force generation even if no changes are detected', false)
    .option('--verbose', 'Show debug output', false)
    .option(
      '--filter-providers, --filter-targets <providers>',
      'Only run tests with these providers (regex match)',
    )
    .action(async (opts: RedteamRunOptions) => {
      setupEnv(opts.envPath);
      telemetry.record('command_used', {
        name: 'redteam run',
      });
      await telemetry.send();

      if (opts.verbose) {
        setLogLevel('debug');
      }

      if (opts.id) {
        const config = await getConfigFromCloud(opts.id);
        opts.liveRedteamConfig = config;
      }

      try {
        if (opts.remote) {
          cliState.remote = true;
        }
        await doRedteamRun(opts);
      } catch (error) {
        if (error instanceof z.ZodError) {
          logger.error('Invalid options:');
          error.errors.forEach((err: z.ZodIssue) => {
            logger.error(`  ${err.path.join('.')}: ${err.message}`);
          });
        } else {
          logger.error('An unexpected error occurred:', error);
        }
        process.exitCode = 1;
      }
    });

  poisonCommand(program);
}
