import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';

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

/**
 * Checks for generation errors and prompts user for confirmation
 */
async function checkGenerationErrorsAndConfirm(
  pluginResults: Record<string, { requested: number; generated: number }>,
  strategyResults: Record<string, { requested: number; generated: number }>,
  forceYes: boolean = false,
): Promise<boolean> {
  const hasErrors = [...Object.entries(pluginResults), ...Object.entries(strategyResults)].some(
    ([_, { requested, generated }]) => generated === 0 || generated < requested,
  );

  if (!hasErrors) {
    return true;
  }

  logger.warn(chalk.yellow('\nGeneration completed with errors:'));

  // Show failed plugins
  const failedPlugins = Object.entries(pluginResults).filter(
    ([_, { generated }]) => generated === 0,
  );
  if (failedPlugins.length > 0) {
    logger.warn(chalk.red('  Failed plugins (0 tests generated):'));
    failedPlugins.forEach(([id]) => logger.warn(chalk.red(`    - ${id}`)));
  }

  // Show partial plugins
  const partialPlugins = Object.entries(pluginResults).filter(
    ([_, { requested, generated }]) => generated > 0 && generated < requested,
  );
  if (partialPlugins.length > 0) {
    logger.warn(chalk.yellow('  Partial plugins (fewer tests than requested):'));
    partialPlugins.forEach(([id, { requested, generated }]) =>
      logger.warn(chalk.yellow(`    - ${id}: ${generated}/${requested} tests`)),
    );
  }

  // Show failed strategies
  const failedStrategies = Object.entries(strategyResults).filter(
    ([_, { generated }]) => generated === 0,
  );
  if (failedStrategies.length > 0) {
    logger.warn(chalk.red('  Failed strategies (0 tests generated):'));
    failedStrategies.forEach(([id]) => logger.warn(chalk.red(`    - ${id}`)));
  }

  // Show partial strategies
  const partialStrategies = Object.entries(strategyResults).filter(
    ([_, { requested, generated }]) => generated > 0 && generated < requested,
  );
  if (partialStrategies.length > 0) {
    logger.warn(chalk.yellow('  Partial strategies (fewer tests than requested):'));
    partialStrategies.forEach(([id, { requested, generated }]) =>
      logger.warn(chalk.yellow(`    - ${id}: ${generated}/${requested} tests`)),
    );
  }

  // Skip prompt if --yes flag is set
  if (forceYes) {
    logger.info(chalk.cyan('Continuing with scan (--yes flag provided)...'));
    return true;
  }

  // Prompt for confirmation
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      chalk.cyan(
        '\nGeneration step contains errors. Do you want to continue with the scan? (y/N): ',
      ),
      (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      },
    );
  });
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

  const {
    config: redteamConfig,
    pluginResults,
    strategyResults,
  } = await doGenerateRedteam({
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

  // Check for generation errors and prompt for confirmation
  if (pluginResults && strategyResults) {
    const shouldContinue = await checkGenerationErrorsAndConfirm(
      pluginResults,
      strategyResults,
      options.yes,
    );
    if (!shouldContinue) {
      logger.info('Scan cancelled by user.');
      return;
    }
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
