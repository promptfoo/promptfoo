import type { Command } from 'commander';
import { z } from 'zod';
import cliState from '../../cliState';
import logger, { setLogLevel } from '../../logger';
import telemetry from '../../telemetry';
import { setupEnv } from '../../util';
import { getConfigFromCloud, getProviderModelFromCloud } from '../../util/cloud';
import { MULTI_TURN_STRATEGIES } from '../constants';
import { doRedteamRun } from '../shared';
import { getUnifiedConfig } from '../sharedFrontend';
import type { RedteamRunOptions, StrategyConfig } from '../types';
import { poisonCommand } from './poison';

const UUID_REGEX = /^[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}$/;

export function redteamRunCommand(program: Command) {
  program
    .command('run')
    .description('Run red teaming process (init, generate, and evaluate)')
    .option(
      '-c, --config [path]',
      'Path to configuration file or cloud config UUID. Defaults to promptfooconfig.yaml',
    )
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
        const provider = await getProviderModelFromCloud(configObj.provider);

        // if the provider is stateful, mark all the multi-turn strategies as stateful
        configObj.config.strategies.forEach((strategy: StrategyConfig) => {
          if (MULTI_TURN_STRATEGIES.includes(strategy.id as any)) {
            strategy.config = { ...(strategy.config || {}), stateful: provider.stateful };
          }
        });

        opts.liveRedteamConfig = getUnifiedConfig(configObj.config);

        // If the session source is client, we need to generate a session id for the test
        if (provider.sessionSource === 'client') {
          opts.liveRedteamConfig.defaultTest = {
            options: {
              transformVars: '{ ...vars, sessionId: context.uuid }',
            },
          };
        }
        if (provider.extensions) {
          opts.liveRedteamConfig.extensions = provider.extensions;
        }

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
