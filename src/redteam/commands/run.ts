import chalk from 'chalk';
import type { Command } from 'commander';
import * as fs from 'fs';
import { z } from 'zod';
import cliState from '../../cliState';
import { doEval } from '../../commands/eval';
import logger, { setLogLevel } from '../../logger';
import telemetry from '../../telemetry';
import type { CommandLineOptions, RedteamCliGenerateOptions } from '../../types';
import { setupEnv, isRunningUnderNpx } from '../../util';
import { loadDefaultConfig } from '../../util/config/default';
import { doGenerateRedteam } from './generate';
import { redteamInit } from './init';
import { poisonCommand } from './poison';

interface RedteamRunOptions {
  config?: string;
  output?: string;
  cache?: boolean;
  envPath?: string;
  maxConcurrency?: number;
  delay?: number;
  remote?: boolean;
  force?: boolean;
  filterProviders?: string;
  filterTargets?: string;
  verbose?: boolean;
}

async function doRedteamRun(options: RedteamRunOptions) {
  const configPath = options.config || 'promptfooconfig.yaml';
  const redteamPath = options.output || 'redteam.yaml';

  // Check if promptfooconfig.yaml exists, if not, run init
  if (!fs.existsSync(configPath)) {
    logger.info('No configuration file found. Running initialization...');
    await redteamInit(undefined);
    // User probably needs to edit init and stuff, so it is premature to generate and eval.
    return;
  }

  // Generate new test cases
  logger.info('Generating test cases...');
  await doGenerateRedteam({
    ...options,
    config: configPath,
    output: redteamPath,
    force: options.force,
    inRedteamRun: true,
  } as Partial<RedteamCliGenerateOptions>);

  // Check if redteam.yaml exists before running evaluation
  if (!fs.existsSync(redteamPath)) {
    logger.info('No test cases generated. Skipping scan.');
    return;
  }

  // Run evaluation
  logger.info('Running scan...');
  const { defaultConfig } = await loadDefaultConfig();
  await doEval(
    {
      ...options,
      config: [redteamPath],
      cache: true, // Enable caching
      write: true, // Write results to database
      filterProviders: options.filterProviders,
      filterTargets: options.filterTargets,
    } as Partial<CommandLineOptions & Command>,
    defaultConfig,
    redteamPath,
    {
      showProgressBar: true,
    },
  );

  logger.info(chalk.green('\nRed team scan complete!'));
  logger.info(
    chalk.blue('To view the results, run: ') +
      chalk.bold(`${isRunningUnderNpx() ? 'npx promptfoo' : 'promptfoo'} redteam report`),
  );
}

export function redteamRunCommand(program: Command) {
  program
    .command('run')
    .description('Run red teaming process (init, generate, and evaluate)')
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
        process.exit(1);
      }
    });

  poisonCommand(program);
}
