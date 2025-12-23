import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import chalk from 'chalk';
import yaml from 'js-yaml';
import { doEval } from '../commands/eval';
import logger, { setLogCallback, setLogLevel } from '../logger';
import { checkRemoteHealth } from '../util/apiHealth';
import { loadDefaultConfig } from '../util/config/default';
import { promptfooCommand } from '../util/promptfooCommand';
import { initVerboseToggle } from '../util/verboseToggle';
import { doGenerateRedteam } from './commands/generate';
import { getRemoteHealthUrl } from './remoteGeneration';

import type Eval from '../models/eval';
import type { RedteamRunOptions } from './types';

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
    // Use stable filename based on cloud IDs so we can reuse cached test cases
    let outputFilename: string;
    logger.debug(
      `[Cache] cloudConfigId: ${options.cloudConfigId}, cloudTargetId: ${options.cloudTargetId}`,
    );
    if (options.cloudConfigId) {
      const configSuffix = options.cloudConfigId.slice(0, 8);
      const targetSuffix = options.cloudTargetId ? `-${options.cloudTargetId.slice(0, 8)}` : '';
      outputFilename = `redteam-${configSuffix}${targetSuffix}.yaml`;
      logger.debug(`[Cache] Using stable filename: ${outputFilename}`);
    } else {
      outputFilename = `redteam-${Date.now()}.yaml`;
      logger.debug(`[Cache] Using timestamp filename: ${outputFilename}`);
    }
    const tmpDir = options.loadedFromCloud ? '' : os.tmpdir();
    redteamPath = path.join(tmpDir, outputFilename);

    // Write liveRedteamConfig to a SEPARATE temp file for the config input
    // This prevents overwriting the output file which may contain cached test cases with targetHash
    const configFilename = `redteam-config-${Date.now()}.yaml`;
    const configTmpFile = path.join(tmpDir, configFilename);
    fs.mkdirSync(path.dirname(configTmpFile), { recursive: true });
    fs.writeFileSync(configTmpFile, yaml.dump(options.liveRedteamConfig));
    configPath = configTmpFile;

    logger.debug(`Using live config from ${configTmpFile}`);
    logger.debug(`Output will be written to ${redteamPath}`);
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
    // Pass liveRedteamConfig as configFromCloud to enable hash checking for reuse
    ...(options.liveRedteamConfig ? { configFromCloud: options.liveRedteamConfig } : {}),
  });

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

  logger.info(chalk.green('\nRed team scan complete!'));
  if (!evalResult?.shared) {
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
