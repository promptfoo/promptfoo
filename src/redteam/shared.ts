import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import chalk from 'chalk';
import yaml from 'js-yaml';
import { doEval } from '../commands/eval';
import logger, { setLogCallback, setLogLevel } from '../logger';
import { checkRemoteHealth } from '../util/apiHealth';
import { loadDefaultConfig } from '../util/config/default';
import { formatDuration } from '../util/formatDuration';
import { promptfooCommand } from '../util/promptfooCommand';
import { initVerboseToggle } from '../util/verboseToggle';
import { doGenerateRedteam } from './commands/generate';
import { getRemoteHealthUrl } from './remoteGeneration';
import { PartialGenerationError } from './types';

import type Eval from '../models/eval';
import type { RedteamRunOptions } from './types';

async function checkApiHealth(): Promise<void> {
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
}

function resolveRedteamPaths(options: RedteamRunOptions): {
  configPath: string;
  redteamPath: string;
} {
  const configPath: string = options.config ?? 'promptfooconfig.yaml';
  const redteamPath = options.output
    ? options.output
    : path.join(path.dirname(configPath), 'redteam.yaml');
  return { configPath, redteamPath };
}

function applyLiveConfig(options: RedteamRunOptions): { configPath: string; redteamPath: string } {
  const filename = `redteam-${Date.now()}.yaml`;
  const tmpDir = options.loadedFromCloud ? '' : os.tmpdir();
  const tmpFile = path.join(tmpDir, filename);
  fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
  fs.writeFileSync(tmpFile, yaml.dump(options.liveRedteamConfig));
  logger.debug(`Using live config from ${tmpFile}`);
  logger.debug(`Live config: ${JSON.stringify(options.liveRedteamConfig, null, 2)}`);
  return { configPath: tmpFile, redteamPath: tmpFile };
}

async function generateTestCases(
  options: RedteamRunOptions,
  configPath: string,
  redteamPath: string,
  verboseToggleCleanup: (() => void) | null,
) {
  logger.info('Generating test cases...');
  const { maxConcurrency, ...passThroughOptions } = options;

  try {
    return await doGenerateRedteam({
      ...passThroughOptions,
      ...(options.liveRedteamConfig?.commandLineOptions || {}),
      ...(maxConcurrency !== undefined ? { maxConcurrency } : {}),
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
      setLogCallback(null);
      if (verboseToggleCleanup) {
        verboseToggleCleanup();
      }
      throw error;
    }
    throw error;
  }
}

function logScanResults(
  options: RedteamRunOptions,
  evalResult: Eval,
  generationDurationMs: number,
): void {
  if (generationDurationMs >= 0) {
    evalResult.setGenerationDurationMs(generationDurationMs);
    const totalMs = evalResult.durationMs ?? 0;
    const evalMs = evalResult.evaluationDurationMs ?? 0;
    logger.info(
      chalk.gray(
        `Total scan time: ${formatDuration(totalMs / 1000)} (generation: ${formatDuration(generationDurationMs / 1000)}, evaluation: ${formatDuration(evalMs / 1000)})`,
      ),
    );
  }

  logger.info(chalk.green('\nRed team scan complete!'));
  if (!evalResult.shared) {
    if (options.liveRedteamConfig) {
      logger.info(
        chalk.blue(
          `To view the results, click the ${chalk.bold('View Report')} button or run ${chalk.bold(promptfooCommand('redteam report'))} on the command line.`,
        ),
      );
    } else {
      logger.info(
        chalk.blue(`To view the results, run ${chalk.bold(promptfooCommand('redteam report'))}`),
      );
    }
  }
}

export async function doRedteamRun(options: RedteamRunOptions): Promise<Eval | undefined> {
  if (options.verbose) {
    setLogLevel('debug');
  }
  if (options.logCallback) {
    setLogCallback(options.logCallback);
  }

  // Enable live verbose toggle (press 'v' to toggle debug logs)
  // Only works in interactive TTY mode, not in CI or web UI
  const verboseToggleCleanup = options.logCallback ? null : initVerboseToggle();

  let { configPath, redteamPath } = resolveRedteamPaths(options);

  // Check API health before proceeding
  try {
    await checkApiHealth();
  } catch (error) {
    logger.warn(
      `API health check failed with error: ${error}.\nPlease check your API configuration or try again later.`,
    );
  }

  if (options.liveRedteamConfig) {
    ({ configPath, redteamPath } = applyLiveConfig(options));
  }

  const generationStartTime = Date.now();
  const redteamConfig = await generateTestCases(
    options,
    configPath,
    redteamPath,
    verboseToggleCleanup,
  );
  const generationDurationMs = Date.now() - generationStartTime;

  // Check if redteam.yaml exists before running evaluation
  if (!redteamConfig || !fs.existsSync(redteamPath)) {
    logger.info('No test cases generated. Skipping scan.');
    if (verboseToggleCleanup) {
      verboseToggleCleanup();
    }
    return;
  }

  // Run evaluation
  logger.info('Running scan...');
  const { defaultConfig } = await loadDefaultConfig();
  // Exclude 'description' from options to avoid conflict with Commander's description method
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
    },
  );

  // Set generation duration on the eval and save
  if (evalResult) {
    logScanResults(options, evalResult, generationDurationMs);
    if (evalResult.persisted) {
      await evalResult.save();
    }
  }

  // Cleanup
  setLogCallback(null);
  if (verboseToggleCleanup) {
    verboseToggleCleanup();
  }
  return evalResult;
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
