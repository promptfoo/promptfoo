import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import chalk from 'chalk';
import yaml from 'js-yaml';
import { doEval } from '../commands/eval';
import { cloudConfig } from '../globalConfig/cloud';
import logger, { setLogCallback, setLogLevel } from '../logger';
import { checkRemoteHealth } from '../util/apiHealth';
import { createEvalInCloud, streamResultsToCloud } from '../util/cloud';
import { loadDefaultConfig } from '../util/config/default';
import { promptfooCommand } from '../util/promptfooCommand';
import { initVerboseToggle } from '../util/verboseToggle';
import { doGenerateRedteam } from './commands/generate';
import { getRemoteHealthUrl } from './remoteGeneration';

import type Eval from '../models/eval';
import type { EvaluateResult, UnifiedConfig } from '../types';
import type { RedteamRunOptions } from './types';

export interface RedteamResumeOptions extends Omit<RedteamRunOptions, 'config'> {
  /** The config with generated tests from the cloud eval */
  liveRedteamConfig: UnifiedConfig;
  /** The eval ID being resumed */
  resumeEvalId: string;
  /** Callback to stream results back to cloud */
  resultStreamCallback?: (result: EvaluateResult) => Promise<void>;
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

  let configPath: string = options.config ?? 'promptfooconfig.yaml';

  // If output filepath is not provided, locate the out file in the same directory as the config file:
  let redteamPath;
  if (options.output) {
    redteamPath = options.output;
  } else {
    const configDir = path.dirname(configPath);
    redteamPath = path.join(configDir, 'redteam.yaml');
  }

  // Check API health before proceeding
  try {
    const healthUrl = getRemoteHealthUrl();
    if (healthUrl) {
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
  } catch (error) {
    logger.warn(
      `API health check failed with error: ${error}.\nPlease check your API configuration or try again later.`,
    );
  }

  if (options.liveRedteamConfig) {
    // Write liveRedteamConfig to a temporary file
    const filename = `redteam-${Date.now()}.yaml`;
    const tmpDir = options.loadedFromCloud ? '' : os.tmpdir();
    const tmpFile = path.join(tmpDir, filename);
    fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
    fs.writeFileSync(tmpFile, yaml.dump(options.liveRedteamConfig));
    redteamPath = tmpFile;
    // Do not use default config.
    configPath = tmpFile;
    logger.debug(`Using live config from ${tmpFile}`);
    logger.debug(`Live config: ${JSON.stringify(options.liveRedteamConfig, null, 2)}`);
  }

  // Generate new test cases
  logger.info('Generating test cases...');
  const { maxConcurrency, ...passThroughOptions } = options;

  const redteamConfig = await doGenerateRedteam({
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

  // Check if redteam.yaml exists before running evaluation
  if (!redteamConfig || !fs.existsSync(redteamPath)) {
    logger.info('No test cases generated. Skipping scan.');
    if (verboseToggleCleanup) {
      verboseToggleCleanup();
    }
    return;
  }

  // For cloud runs, create eval in cloud BEFORE evaluation starts
  // This enables resume if the scan is cancelled
  let cloudEvalId: string | undefined;
  let resultStreamCallback: ((result: EvaluateResult) => Promise<void>) | undefined;
  const resultBuffer: EvaluateResult[] = [];

  if (options.loadedFromCloud && cloudConfig.isEnabled()) {
    try {
      // Read the generated config to get tests
      const generatedConfig = yaml.load(fs.readFileSync(redteamPath, 'utf8')) as UnifiedConfig;

      logger.info('Creating eval in cloud for streaming...');
      cloudEvalId = await createEvalInCloud({
        config: generatedConfig,
        createdAt: new Date(),
      });

      logger.info(chalk.cyan(`Cloud eval created: ${cloudEvalId}`));
      logger.info(
        chalk.dim(`If cancelled, resume with: promptfoo redteam run --resume ${cloudEvalId}`),
      );

      // Set up result streaming
      const BATCH_SIZE = parseInt(process.env.PROMPTFOO_SHARE_CHUNK_SIZE || '10', 10);

      resultStreamCallback = async (result: EvaluateResult) => {
        resultBuffer.push(result);
        if (resultBuffer.length >= BATCH_SIZE) {
          const toSend = resultBuffer.splice(0, resultBuffer.length);
          try {
            await streamResultsToCloud(cloudEvalId!, toSend);
          } catch (error) {
            logger.warn(`Failed to stream results to cloud: ${error}`);
            // Re-add to buffer on failure
            resultBuffer.unshift(...toSend);
          }
        }
      };
    } catch (error) {
      logger.warn(`Failed to set up cloud streaming: ${error}`);
      logger.warn('Falling back to standard upload after completion.');
    }
  }

  // Run evaluation
  logger.info('Running scan...');
  const { defaultConfig } = await loadDefaultConfig();
  const evalResult = await doEval(
    {
      ...options,
      config: [redteamPath],
      output: options.output ? [options.output] : undefined,
      cache: true,
      write: !cloudEvalId, // Don't write locally if streaming to cloud
      filterProviders: options.filterProviders,
      filterTargets: options.filterTargets,
    },
    defaultConfig,
    redteamPath,
    {
      showProgressBar: options.progressBar,
      abortSignal: options.abortSignal,
      progressCallback: options.progressCallback,
      resultStreamCallback,
    },
  );

  // Flush remaining results to cloud
  if (cloudEvalId && resultBuffer.length > 0) {
    try {
      await streamResultsToCloud(cloudEvalId, resultBuffer);
    } catch (error) {
      logger.warn(`Failed to flush remaining results to cloud: ${error}`);
    }
  }

  logger.info(chalk.green('\nRed team scan complete!'));

  if (cloudEvalId) {
    logger.info(chalk.blue(`View results at: ${cloudConfig.getAppUrl()}/eval/${cloudEvalId}`));
  } else if (!evalResult?.shared) {
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

/**
 * Resumes a partially completed red team scan from cloud.
 * This skips test generation (tests already exist) and runs evaluation only,
 * streaming results back to the cloud.
 */
export async function doRedteamResume(options: RedteamResumeOptions): Promise<Eval | undefined> {
  if (options.verbose) {
    setLogLevel('debug');
  }
  if (options.logCallback) {
    setLogCallback(options.logCallback);
  }

  // Enable live verbose toggle (press 'v' to toggle debug logs)
  const verboseToggleCleanup = options.logCallback ? null : initVerboseToggle();

  const { liveRedteamConfig, resultStreamCallback } = options;

  // Write the config to a temporary file for doEval
  const filename = `redteam-resume-${Date.now()}.yaml`;
  const tmpFile = path.join('', filename);
  fs.mkdirSync(path.dirname(tmpFile) || '.', { recursive: true });
  fs.writeFileSync(tmpFile, yaml.dump(liveRedteamConfig));

  logger.debug(`Resume config written to ${tmpFile}`);
  const testsCount = Array.isArray(liveRedteamConfig.tests) ? liveRedteamConfig.tests.length : 0;
  logger.debug(`Config has ${testsCount} tests`);

  const { defaultConfig } = await loadDefaultConfig();

  // Exclude 'resume' from options to avoid conflict with write: false in doEval
  // Cloud resume uses cliState.cloudCompletedPairs instead of doEval's --resume flag
  const { resume: _resume, ...evalOptions } = options as any;

  const evalResult = await doEval(
    {
      ...evalOptions,
      config: [tmpFile],
      output: options.output ? [options.output] : undefined,
      cache: true,
      write: false, // Don't write to local DB since we're streaming to cloud
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
    },
  );

  // Clean up temp file
  try {
    fs.unlinkSync(tmpFile);
  } catch {
    // Ignore cleanup errors
  }

  logger.info(chalk.green('\nResume scan complete!'));

  // Cleanup
  setLogCallback(null);
  if (verboseToggleCleanup) {
    verboseToggleCleanup();
  }

  return evalResult;
}
