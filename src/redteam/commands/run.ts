import chalk from 'chalk';
import dedent from 'dedent';
import { z } from 'zod';
import cliState from '../../cliState';
import { CLOUD_PROVIDER_PREFIX } from '../../constants';
import { EmailValidationError } from '../../globalConfig/accounts';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { getConfigFromCloud } from '../../util/cloud';
import { ConfigResolutionError, logConfigResolutionError } from '../../util/config/load';
import { setupEnv } from '../../util/index';
import { doRedteamRun } from '../shared';
import { ProbeLimitExceededError, type RedteamRunOptions } from '../types';
import { poisonCommand } from './poison';
import type { Command } from 'commander';

const UUID_REGEX = /^[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}$/;

async function hydrateCloudRunConfig(opts: RedteamRunOptions): Promise<boolean> {
  if (!opts.config || !UUID_REGEX.test(opts.config)) {
    return false;
  }

  if (opts.target && !UUID_REGEX.test(opts.target)) {
    throw new Error('Invalid target ID, it must be a valid UUID');
  }

  const configObj = await getConfigFromCloud(opts.config, opts.target);
  if (
    opts.target &&
    UUID_REGEX.test(opts.target) &&
    (!configObj.targets || configObj.targets.length === 0)
  ) {
    configObj.targets = [{ id: `${CLOUD_PROVIDER_PREFIX}${opts.target}`, config: {} }];
  }
  if (opts.description) {
    configObj.description = opts.description;
  }

  opts.liveRedteamConfig = configObj;
  opts.config = undefined;
  opts.loadedFromCloud = true;
  return true;
}

function rejectStandaloneTarget(opts: RedteamRunOptions): boolean {
  if (!opts.target) {
    return false;
  }

  logger.error(
    `Target ID (-t) can only be used when -c is used. To use a cloud target inside of a config set the id of the target to ${CLOUD_PROVIDER_PREFIX}${opts.target}. `,
  );
  process.exitCode = 1;
  return true;
}

function applyRedteamCliState(opts: RedteamRunOptions): void {
  if (opts.remote) {
    cliState.remote = true;
  }
  if (opts.maxConcurrency !== undefined) {
    cliState.maxConcurrency = opts.maxConcurrency;
  }
}

function logRedteamRunError(error: unknown): void {
  if (error instanceof z.ZodError) {
    logger.error('Invalid options:');
    error.issues.forEach((err: z.ZodIssue) => {
      logger.error(`  ${err.path.join('.')}: ${err.message}`);
    });
    return;
  }
  if (error instanceof ConfigResolutionError) {
    logConfigResolutionError(error);
    return;
  }
  if (error instanceof EmailValidationError || error instanceof ProbeLimitExceededError) {
    return;
  }

  logger.error(
    `An unexpected error occurred during red team run: ${error instanceof Error ? error.message : String(error)}\n${
      error instanceof Error ? error.stack : ''
    }`,
  );
}

async function handleRedteamRunAction(opts: RedteamRunOptions): Promise<void> {
  setupEnv(opts.envPath);
  telemetry.record('redteam run', {});

  const loadedFromCloud = await hydrateCloudRunConfig(opts);
  if (!loadedFromCloud && rejectStandaloneTarget(opts)) {
    return;
  }

  try {
    applyRedteamCliState(opts);
    await doRedteamRun({ ...opts, eventSource: 'cli' });
  } catch (error) {
    logRedteamRunError(error);
    process.exitCode = 1;
  } finally {
    cliState.remote = false;
    cliState.maxConcurrency = undefined;
  }
}

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
    .option('-j, --max-concurrency <number>', 'Maximum number of concurrent API calls', (val) =>
      Number.parseInt(val, 10),
    )
    .option('--delay <number>', 'Delay in milliseconds between API calls', (val) =>
      Number.parseInt(val, 10),
    )
    .option('--remote', 'Force remote inference wherever possible', false)
    .option('--force', 'Force generation even if no changes are detected', false)
    .option('--no-progress-bar', 'Do not show progress bar')
    .option(
      '--strict',
      'Fail if any plugins fail to generate test cases. By default, warnings are logged but generation continues.',
      false,
    )
    .option(
      '--filter-prompts <pattern>',
      'Only run tests with prompts whose id or label matches the regex pattern',
    )
    .option(
      '--filter-providers, --filter-targets <providers>',
      'Only run tests with these providers (regex match)',
    )
    .option('-t, --target <id>', 'Cloud provider target ID to run the scan on')
    .option('-d, --description <text>', 'Custom description/name for this scan run')
    .action(handleRedteamRunAction);

  poisonCommand(program);
}
