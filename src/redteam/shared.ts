import fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import chalk from 'chalk';
import yaml from 'js-yaml';
import { doEval } from '../commands/eval';
import { cloudConfig } from '../globalConfig/cloud';
import logger, { clearLogCallbackIfOwned, setLogCallback, setLogLevel } from '../logger';
import { isCliEventSource } from '../types/eventSource';
import { checkRemoteHealth } from '../util/apiHealth';
import { createEvalInCloud, streamResultsToCloud } from '../util/cloud';
import { loadDefaultConfig } from '../util/config/default';
import { pathExists } from '../util/file';
import { formatDuration } from '../util/formatDuration';
import { promptfooCommand } from '../util/promptfooCommand';
import { initVerboseToggle } from '../util/verboseToggle';
import { doGenerateRedteam } from './commands/generate';
import { getRemoteHealthUrl } from './remoteGeneration';
import { PartialGenerationError } from './types';

import type Eval from '../models/eval';
import type { EvaluateResult, UnifiedConfig } from '../types';
import type { RedteamRunOptions } from './types';

export interface RedteamResumeOptions extends Omit<RedteamRunOptions, 'config'> {
  liveRedteamConfig: UnifiedConfig;
  resumeEvalId: string;
  resultStreamCallback?: (result: EvaluateResult) => Promise<void>;
}

export function createCloudResultStreamer(evalId: string) {
  const resultBuffer: EvaluateResult[] = [];
  const parsedBatchSize = Number.parseInt(process.env.PROMPTFOO_SHARE_CHUNK_SIZE || '10', 10);
  const batchSize = Number.isFinite(parsedBatchSize) && parsedBatchSize > 0 ? parsedBatchSize : 10;
  logger.debug(`Using result stream batch size: ${batchSize}`);

  const flush = async () => {
    if (resultBuffer.length === 0) {
      return;
    }

    const toSend = resultBuffer.splice(0, resultBuffer.length);
    try {
      await streamResultsToCloud(evalId, toSend);
    } catch (error) {
      logger.warn(`Failed to stream results to cloud: ${error}`);
      resultBuffer.unshift(...toSend);
      throw error;
    }
  };

  const resultStreamCallback = async (result: EvaluateResult) => {
    resultBuffer.push(result);
    if (resultBuffer.length >= batchSize) {
      try {
        await flush();
      } catch {
        // The warning is logged in flush; keep the evaluator moving.
      }
    }
  };

  return { resultStreamCallback, flush };
}

type RedteamPaths = {
  configPath: string;
  redteamPath: string;
};

function configureRedteamLogging(options: RedteamRunOptions) {
  const isCliInvocation = isCliEventSource(options);
  if (options.verbose) {
    setLogLevel('debug');
  }
  if (options.logCallback) {
    setLogCallback(options.logCallback);
  }

  // Enable live verbose toggle (press 'v' to toggle debug logs)
  // Only works in interactive TTY mode, not in CI or web UI
  return options.logCallback || !isCliInvocation
    ? null
    : initVerboseToggle({
        onInterrupt: () => process.kill(process.pid, 'SIGINT'),
      });
}

function cleanupRedteamLogging(
  verboseToggleCleanup: ReturnType<typeof initVerboseToggle>,
  logCallback: RedteamRunOptions['logCallback'],
) {
  clearLogCallbackIfOwned(logCallback ?? null);
  if (verboseToggleCleanup) {
    verboseToggleCleanup();
  }
}

function getRedteamPaths(options: RedteamRunOptions): RedteamPaths {
  const configPath = options.config ?? 'promptfooconfig.yaml';
  if (options.output) {
    return { configPath, redteamPath: options.output };
  }
  return {
    configPath,
    redteamPath: path.join(path.dirname(configPath), 'redteam.yaml'),
  };
}

async function applyLiveRedteamConfig(
  options: RedteamRunOptions,
  paths: RedteamPaths,
): Promise<RedteamPaths> {
  if (!options.liveRedteamConfig) {
    return paths;
  }

  const filename = `redteam-${Date.now()}.yaml`;
  const tmpDir = options.loadedFromCloud ? '' : os.tmpdir();
  const tmpFile = path.join(tmpDir, filename);
  await fs.mkdir(path.dirname(tmpFile), { recursive: true });
  await fs.writeFile(tmpFile, yaml.dump(options.liveRedteamConfig));
  logger.debug(`Using live config from ${tmpFile}`);
  logger.debug(`Live config: ${JSON.stringify(options.liveRedteamConfig, null, 2)}`);

  return { configPath: tmpFile, redteamPath: tmpFile };
}

async function checkPromptfooApiHealth() {
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

async function generateRedteamTestCases(
  options: RedteamRunOptions,
  configPath: string,
  redteamPath: string,
  verboseToggleCleanup: ReturnType<typeof initVerboseToggle>,
) {
  logger.info('Generating test cases...');
  const { maxConcurrency, ...passThroughOptions } = options;

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
      throw error;
    }
    throw error;
  }
}

async function setupCloudStreamingForRun(options: RedteamRunOptions, redteamPath: string) {
  let cloudEvalId: string | undefined;
  let cloudStreamer: ReturnType<typeof createCloudResultStreamer> | undefined;

  if (!options.loadedFromCloud || !cloudConfig.isEnabled()) {
    return { cloudEvalId, cloudStreamer };
  }

  try {
    const generatedConfig = yaml.load(await fs.readFile(redteamPath, 'utf8')) as UnifiedConfig;

    logger.info('Creating eval in cloud for streaming...');
    cloudEvalId = await createEvalInCloud({
      config: generatedConfig,
      createdAt: new Date(),
    });

    logger.info(chalk.cyan(`Cloud eval created: ${cloudEvalId}`));
    logger.info(
      chalk.dim(`If cancelled, resume with: promptfoo redteam run --resume ${cloudEvalId}`),
    );
    cloudStreamer = createCloudResultStreamer(cloudEvalId);
  } catch (error) {
    logger.warn(`Failed to set up cloud streaming: ${error}`);
    logger.warn('Falling back to standard upload after completion.');
  }

  return { cloudEvalId, cloudStreamer };
}

async function flushCloudStreamer(cloudStreamer?: ReturnType<typeof createCloudResultStreamer>) {
  if (!cloudStreamer) {
    return;
  }

  try {
    await cloudStreamer.flush();
  } catch (error) {
    logger.warn(`Failed to flush remaining results to cloud: ${error}`);
  }
}

async function logEvalTiming(evalResult: Eval | undefined, generationDurationMs: number) {
  if (!evalResult || generationDurationMs < 0) {
    return;
  }

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

async function logRedteamCompletion(
  evalResult: Eval | undefined,
  options: RedteamRunOptions,
  cloudEvalId: string | undefined,
) {
  const hasTargetError = evalResult ? (await evalResult.findTargetErrorStatus()) != null : false;
  if (!hasTargetError) {
    logger.info(chalk.green('\nRed team scan complete!'));
  }

  if (cloudEvalId) {
    logger.info(chalk.blue(`View results at: ${cloudConfig.getAppUrl()}/eval/${cloudEvalId}`));
    return;
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
  } else {
    logger.info(
      chalk.blue(`To view the results, run ${chalk.bold(promptfooCommand('redteam report'))}`),
    );
  }
}

export async function doRedteamRun(options: RedteamRunOptions): Promise<Eval | undefined> {
  const verboseToggleCleanup = configureRedteamLogging(options);
  try {
    const { configPath, redteamPath } = await applyLiveRedteamConfig(
      options,
      getRedteamPaths(options),
    );

    await checkPromptfooApiHealth();

    const generationStartTime = Date.now();
    const redteamConfig = await generateRedteamTestCases(
      options,
      configPath,
      redteamPath,
      verboseToggleCleanup,
    );
    const generationDurationMs = Date.now() - generationStartTime;

    if (!redteamConfig || !(await pathExists(redteamPath))) {
      logger.info('No test cases generated. Skipping scan.');
      return;
    }

    const { cloudEvalId, cloudStreamer } = await setupCloudStreamingForRun(options, redteamPath);

    logger.info('Running scan...');
    const { defaultConfig } = await loadDefaultConfig();
    const { description: _description, ...evalOptions } = options;
    const evalResult = await doEval(
      {
        ...evalOptions,
        config: [redteamPath],
        output: options.output ? [options.output] : undefined,
        cache: true,
        write: !cloudEvalId,
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
        resultStreamCallback: cloudStreamer?.resultStreamCallback,
        eventSource: options.eventSource,
      },
    );

    await flushCloudStreamer(cloudStreamer);
    await logEvalTiming(evalResult, generationDurationMs);
    await logRedteamCompletion(evalResult, options, cloudEvalId);

    return evalResult;
  } finally {
    cleanupRedteamLogging(verboseToggleCleanup, options.logCallback);
  }
}

/**
 * Resumes a partially completed cloud red team scan without regenerating tests.
 */
export async function doRedteamResume(options: RedteamResumeOptions): Promise<Eval | undefined> {
  if (options.verbose) {
    setLogLevel('debug');
  }
  if (options.logCallback) {
    setLogCallback(options.logCallback);
  }

  const verboseToggleCleanup =
    options.logCallback || !isCliEventSource(options)
      ? null
      : initVerboseToggle({
          onInterrupt: () => process.kill(process.pid, 'SIGINT'),
        });
  const { liveRedteamConfig, resultStreamCallback } = options;
  const filename = `redteam-resume-${Date.now()}.yaml`;
  const tmpFile = path.join('', filename);

  try {
    await fs.mkdir(path.dirname(tmpFile), { recursive: true });
    await fs.writeFile(tmpFile, yaml.dump(liveRedteamConfig));

    logger.debug(`Resume config written to ${tmpFile}`);
    const testsCount = Array.isArray(liveRedteamConfig.tests) ? liveRedteamConfig.tests.length : 0;
    logger.debug(`Config has ${testsCount} tests`);

    const { defaultConfig } = await loadDefaultConfig();
    const {
      description: _description,
      liveRedteamConfig: _liveRedteamConfig,
      resume: _resume,
      resumeEvalId: _resumeEvalId,
      resultStreamCallback: _resultStreamCallback,
      ...evalOptions
    } = options as RedteamResumeOptions & { description?: string; resume?: string };
    const evalResult = await doEval(
      {
        ...evalOptions,
        config: [tmpFile],
        output: options.output ? [options.output] : undefined,
        cache: true,
        write: false,
        filterPrompts: options.filterPrompts,
        filterProviders: options.filterProviders,
        filterTargets: options.filterTargets,
      },
      defaultConfig,
      tmpFile,
      {
        showProgressBar: options.progressBar,
        abortSignal: options.abortSignal,
        progressCallback: options.progressCallback,
        resultStreamCallback,
        eventSource: options.eventSource,
      },
    );

    logger.info(chalk.green('\nResume scan complete!'));
    return evalResult;
  } finally {
    try {
      await fs.unlink(tmpFile);
    } catch {
      // Ignore cleanup errors.
    }
    clearLogCallbackIfOwned(options.logCallback ?? null);
    if (verboseToggleCleanup) {
      verboseToggleCleanup();
    }
  }
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
