import chalk from 'chalk';
import type { Command } from 'commander';
import dedent from 'dedent';
import { z } from 'zod';
import cliState from '../../cliState';
import logger, { setLogLevel } from '../../logger';
import telemetry from '../../telemetry';
import { setupEnv } from '../../util';
import { getConfigFromCloud } from '../../util/cloud';
import { doRedteamRun } from '../shared';
import type { RedteamRunOptions } from '../types';
import { poisonCommand } from './poison';

const UUID_REGEX = /^[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}$/;

export function redteamRunCommand(program: Command) {
  program
    .command('run')
    .description(
      dedent`
        ${chalk.red('Red team')} a target application, a two-step process:

        1. Generates dynamic attack probes (i.e. test cases) tailored to your target application using specialized uncensored models.
        2. Evaluates the generated probes against your target application.
      `,
    )
    .option(
      '-c, --config [path]',
      'Path to configuration file or cloud config UUID. Defaults to promptfooconfig.yaml',
    )
    .option(
      '-o, --output [path]',
      'Path to output file for generated tests. Defaults to redteam.yaml in the same directory as the configuration file.',
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
    .option('--no-progress-bar', 'Do not show progress bar')
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

      if (opts.config && UUID_REGEX.test(opts.config)) {
        const configObj = await getConfigFromCloud(opts.config);

        opts.liveRedteamConfig = configObj;

        opts.config = undefined;

        opts.loadedFromCloud = true;
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
          logger.error(
            `An unexpected error occurred during red team run: ${error instanceof Error ? error.message : String(error)}\n${
              error instanceof Error ? error.stack : ''
            }`,
          );
        }
        process.exitCode = 1;
      }
    });

  poisonCommand(program);
}
