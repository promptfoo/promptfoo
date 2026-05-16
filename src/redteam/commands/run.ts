import chalk from 'chalk';
import dedent from 'dedent';
import { z } from 'zod';
import cliState from '../../cliState';
import { CLOUD_PROVIDER_PREFIX } from '../../constants';
import { EmailValidationError } from '../../globalConfig/accounts';
import { cloudConfig } from '../../globalConfig/cloud';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { getCompletedPairsFromCloud, getConfigFromCloud, getEvalFromCloud } from '../../util/cloud';
import { ConfigResolutionError, logConfigResolutionError } from '../../util/config/load';
import { setupEnv } from '../../util/index';
import { createCloudResultStreamer, doRedteamResume, doRedteamRun } from '../shared';
import { ProbeLimitExceededError, type RedteamRunOptions } from '../types';
import { poisonCommand } from './poison';
import type { Command } from 'commander';

const UUID_REGEX = /^[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}$/;
const CLOUD_EVAL_ID_REGEX = /^eval-[A-Za-z0-9]+-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

type RedteamRunCommandOptions = RedteamRunOptions & { resume?: string };

function isValidResumeEvalId(evalId: string) {
  return UUID_REGEX.test(evalId) || CLOUD_EVAL_ID_REGEX.test(evalId);
}

function applyCliRuntimeOptions(opts: RedteamRunOptions) {
  if (opts.remote) {
    cliState.remote = true;
  }
  if (opts.maxConcurrency !== undefined) {
    cliState.maxConcurrency = opts.maxConcurrency;
  }
}

function resetCliRuntimeOptions() {
  cliState.remote = false;
  cliState.maxConcurrency = undefined;
}

function resetCloudResumeState() {
  cliState.resume = false;
  cliState.cloudResumeEvalId = undefined;
  cliState.cloudCompletedPairs = undefined;
  resetCliRuntimeOptions();
}

async function flushResumeStreamer(streamer: ReturnType<typeof createCloudResultStreamer>) {
  try {
    await streamer.flush();
  } catch (error) {
    logger.warn(`Failed to flush remaining results to cloud: ${error}`);
  }
}

async function handleCloudResume(opts: RedteamRunCommandOptions) {
  const evalId = opts.resume!;
  if (!isValidResumeEvalId(evalId)) {
    logger.error('Invalid eval ID for --resume. It must be a valid UUID or cloud eval ID.');
    process.exitCode = 1;
    return;
  }

  if (!cloudConfig.isEnabled()) {
    logger.error(
      'Cloud is not configured. Please run `promptfoo auth login` to enable cloud features before resuming a scan.',
    );
    process.exitCode = 1;
    return;
  }

  try {
    applyCliRuntimeOptions(opts);
    logger.info(`Resuming scan from eval ${evalId}...`);
    const cloudEval = await getEvalFromCloud(evalId);

    if (!Array.isArray(cloudEval.config.tests) || cloudEval.config.tests.length === 0) {
      logger.error(
        'Cannot resume: the eval does not contain generated tests. The scan may have failed before test generation completed.',
      );
      process.exitCode = 1;
      return;
    }

    const completedPairs = await getCompletedPairsFromCloud(evalId);
    cliState.resume = true;
    cliState.cloudResumeEvalId = evalId;
    cliState.cloudCompletedPairs = completedPairs;

    const streamer = createCloudResultStreamer(evalId);
    await doRedteamResume({
      ...opts,
      eventSource: 'cli',
      liveRedteamConfig: cloudEval.config,
      resumeEvalId: evalId,
      resultStreamCallback: streamer.resultStreamCallback,
    });
    await flushResumeStreamer(streamer);

    logger.info(chalk.blue(`\nView results at: ${cloudConfig.getAppUrl()}/eval/${evalId}`));
  } catch (error) {
    logger.error(
      `Failed to resume scan: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  } finally {
    resetCloudResumeState();
  }
}

async function applyCloudConfigOptions(opts: RedteamRunOptions) {
  if (opts.config && UUID_REGEX.test(opts.config)) {
    if (opts.target && !UUID_REGEX.test(opts.target)) {
      throw new Error('Invalid target ID, it must be a valid UUID');
    }
    const configObj = await getConfigFromCloud(opts.config, opts.target);

    if (
      opts.target &&
      UUID_REGEX.test(opts.target) &&
      (!configObj.targets || configObj.targets?.length === 0)
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

  if (!opts.target) {
    return true;
  }

  logger.error(
    `Target ID (-t) can only be used when -c is used. To use a cloud target inside of a config set the id of the target to ${CLOUD_PROVIDER_PREFIX}${opts.target}. `,
  );
  process.exitCode = 1;
  return false;
}

function logRedteamRunError(error: unknown) {
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

async function runStandardRedteam(opts: RedteamRunOptions) {
  try {
    applyCliRuntimeOptions(opts);
    await doRedteamRun({ ...opts, eventSource: 'cli' });
  } catch (error) {
    logRedteamRunError(error);
    process.exitCode = 1;
  } finally {
    resetCliRuntimeOptions();
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
    .option(
      '--resume <evalId>',
      'Resume a partially completed cloud scan by eval ID. Skips test generation and completed tests.',
    )
    .action(async (opts: RedteamRunCommandOptions) => {
      setupEnv(opts.envPath);
      telemetry.record('redteam run', {});

      if (opts.resume) {
        await handleCloudResume(opts);
        return;
      }

      if (!(await applyCloudConfigOptions(opts))) {
        return;
      }

      await runStandardRedteam(opts);
    });

  poisonCommand(program);
}
