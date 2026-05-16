import fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import chalk from 'chalk';
import yaml from 'js-yaml';
import { doEval } from '../commands/eval';
import logger, { clearLogCallbackIfOwned, setLogCallback, setLogLevel } from '../logger';
import { isCliEventSource } from '../types/eventSource';
import { checkRemoteHealth } from '../util/apiHealth';
import { loadDefaultConfig } from '../util/config/default';
import { pathExists } from '../util/file';
import { formatDuration } from '../util/formatDuration';
import { promptfooCommand } from '../util/promptfooCommand';
import { initVerboseToggle } from '../util/verboseToggle';
import { doGenerateRedteam } from './commands/generate';
import { getRemoteHealthUrl } from './remoteGeneration';
import { PartialGenerationError } from './types';

import type Eval from '../models/eval';
import type { RedteamRunOptions } from './types';

export async function doRedteamRun(options: RedteamRunOptions): Promise<Eval | undefined> {
  const isCliInvocation = isCliEventSource(options);

  if (options.verbose) {
    setLogLevel('debug');
  }
  if (options.logCallback) {
    setLogCallback(options.logCallback);
  }

  // Enable live verbose toggle (press 'v' to toggle debug logs)
  // Only works in interactive TTY mode, not in CI or web UI
  const verboseToggleCleanup =
    options.logCallback || !isCliInvocation
      ? null
      : initVerboseToggle({
          onInterrupt: () => process.kill(process.pid, 'SIGINT'),
        });

  try {
    let { configPath, redteamPath } = getRedteamPaths(options);
    await checkRedteamApiHealth();

    if (options.liveRedteamConfig) {
      ({ configPath, redteamPath } = await writeLiveRedteamConfig(options));
    }

    // Generate new test cases
    logger.info('Generating test cases...');
    const { maxConcurrency, ...passThroughOptions } = options;

    const generationStartTime = Date.now();
    const redteamConfig = await generateRedteamConfig({
      options,
      passThroughOptions,
      maxConcurrency,
      configPath,
      redteamPath,
    });

    const generationDurationMs = Date.now() - generationStartTime;

    // Check if redteam.yaml exists before running evaluation
    if (!redteamConfig || !(await pathExists(redteamPath))) {
      logger.info('No test cases generated. Skipping scan.');
      return;
    }

    const evalResult = await runGeneratedRedteamEval({
      options,
      redteamPath,
      generationDurationMs,
    });
    await logRedteamCompletion({ evalResult, options });
    return evalResult;
  } finally {
    clearLogCallbackIfOwned(options.logCallback ?? null);
    if (verboseToggleCleanup) {
      verboseToggleCleanup();
    }
  }
}

function getRedteamPaths(options: RedteamRunOptions): { configPath: string; redteamPath: string } {
  const configPath = options.config ?? 'promptfooconfig.yaml';
  const redteamPath = options.output || path.join(path.dirname(configPath), 'redteam.yaml');
  return { configPath, redteamPath };
}

async function checkRedteamApiHealth(): Promise<void> {
  try {
    const healthUrl = getRemoteHealthUrl();
    if (!healthUrl) {
      return;
    }
    logger.debug(`Checking Promptfoo API health at ${healthUrl}...`);
    const healthResult = await checkRemoteHealth(healthUrl);
    if (healthResult.status !== 'OK') {
      throw new Error(
        `Unable to proceed with redteam: ${healthResult.message}\n` +
          'Please check your API configuration or try again later.',
      );
    }
    logger.debug('API health check passed');
  } catch (error) {
    logger.warn(
      `API health check failed with error: ${error}.\nPlease check your API configuration or try again later.`,
    );
  }
}

async function writeLiveRedteamConfig(
  options: RedteamRunOptions,
): Promise<{ configPath: string; redteamPath: string }> {
  const filename = `redteam-${Date.now()}.yaml`;
  const tmpDir = options.loadedFromCloud ? '' : os.tmpdir();
  const tmpFile = path.join(tmpDir, filename);
  await fs.mkdir(path.dirname(tmpFile), { recursive: true });
  await fs.writeFile(tmpFile, yaml.dump(options.liveRedteamConfig));
  logger.debug(`Using live config from ${tmpFile}`);
  logger.debug(`Live config: ${JSON.stringify(options.liveRedteamConfig, null, 2)}`);
  return { configPath: tmpFile, redteamPath: tmpFile };
}

async function generateRedteamConfig({
  options,
  passThroughOptions,
  maxConcurrency,
  configPath,
  redteamPath,
}: {
  options: RedteamRunOptions;
  passThroughOptions: Omit<RedteamRunOptions, 'maxConcurrency'>;
  maxConcurrency: RedteamRunOptions['maxConcurrency'];
  configPath: string;
  redteamPath: string;
}) {
  try {
    return await doGenerateRedteam({
      ...passThroughOptions,
      ...(options.liveRedteamConfig?.commandLineOptions || {}),
      ...(maxConcurrency === undefined ? {} : { maxConcurrency }),
      config: configPath,
      output: redteamPath,
      force: options.force,
      verbose: options.verbose,
      delay: options.delay,
      inRedteamRun: true,
      abortSignal: options.abortSignal,
      progressBar: options.progressBar,
    });
  } catch (error) {
    if (error instanceof PartialGenerationError) {
      logger.error(chalk.red('\n' + error.message));
    }
    throw error;
  }
}

async function runGeneratedRedteamEval({
  options,
  redteamPath,
  generationDurationMs,
}: {
  options: RedteamRunOptions;
  redteamPath: string;
  generationDurationMs: number;
}): Promise<Eval | undefined> {
  logger.info('Running scan...');
  const { defaultConfig } = await loadDefaultConfig();
  const { description: _description, ...evalOptions } = options;
  const evalResult = await doEval(
    {
      ...evalOptions,
      config: [redteamPath],
      output: options.output ? [options.output] : undefined,
      cache: true,
      write: true,
      filterPrompts: options.filterPrompts,
      filterProviders: options.filterProviders,
      filterTargets: options.filterTargets,
    },
    defaultConfig,
    redteamPath,
    {
      showProgressBar: options.progressBar,
      abortSignal: options.abortSignal,
      progressCallback: options.progressCallback,
      eventSource: options.eventSource,
    },
  );

  if (evalResult && generationDurationMs >= 0) {
    evalResult.setGenerationDurationMs(generationDurationMs);
    if (evalResult.persisted) {
      await evalResult.save();
    }

    const totalMs = evalResult.durationMs ?? 0;
    const evalMs = evalResult.evaluationDurationMs ?? 0;
    logger.info(
      chalk.gray(
        `Total scan time: ${formatDuration(totalMs / 1000)} (generation: ${formatDuration(generationDurationMs / 1000)}, evaluation: ${formatDuration(evalMs / 1000)})`,
      ),
    );
  }

  return evalResult;
}

async function logRedteamCompletion({
  evalResult,
  options,
}: {
  evalResult: Eval | undefined;
  options: RedteamRunOptions;
}): Promise<void> {
  const hasTargetError = evalResult ? (await evalResult.findTargetErrorStatus()) != null : false;
  if (!hasTargetError) {
    logger.info(chalk.green('\nRed team scan complete!'));
  }
  if (evalResult?.shared) {
    return;
  }

  if (options.liveRedteamConfig) {
    logger.info(
      chalk.blue(
        `To view the results, click the ${chalk.bold('View Report')} button or run ${chalk.bold(promptfooCommand('redteam report'))} on the command line.`,
      ),
    );
    return;
  }
  logger.info(
    chalk.blue(`To view the results, run ${chalk.bold(promptfooCommand('redteam report'))}`),
  );
}

/**
 * Custom error class for target permission-related failures.
 * Thrown when users lack necessary permissions to access or create targets.
 */
export class TargetPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TargetPermissionError';
  }
}
