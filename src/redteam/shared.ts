import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import chalk from 'chalk';
import yaml from 'js-yaml';
import { doEval } from '../commands/eval';
import logger, { setLogCallback, setLogLevel } from '../logger';
import { isPromptfooSampleTarget } from '../providers/shared';
import telemetry from '../telemetry';
import { checkRemoteHealth } from '../util/apiHealth';
import { loadDefaultConfig } from '../util/config/default';
import { promptfooCommand } from '../util/promptfooCommand';
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
    return;
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

  // Record completion telemetry with full results
  if (evalResult) {
    const results = evalResult.results || [];
    const numPasses = results.filter((r) => r.success).length;
    const numFails = results.filter((r) => !r.success && !r.error).length;
    const numErrors = results.filter((r) => r.error).length;

    // Get config info from liveRedteamConfig or try to extract from results
    const config = options.liveRedteamConfig;
    const plugins = config?.plugins?.map((p) => (typeof p === 'string' ? p : p.id)) || [];
    const strategies = config?.strategies?.map((s) => (typeof s === 'string' ? s : s.id)) || [];

    // Check if using sample target
    const isSampleTarget = config?.targets?.some((t) => {
      if (typeof t === 'string') {
        return t.includes('promptfoo:');
      }
      return t.id?.includes('promptfoo:') || isPromptfooSampleTarget(t);
    });

    telemetry.record('redteam run', {
      phase: 'completed',
      numPlugins: plugins.length,
      numStrategies: strategies.length,
      plugins: plugins.slice(0, 50),
      strategies: strategies.slice(0, 20),
      numTests: results.length,
      numPasses,
      numFails,
      numErrors,
      passRate: results.length > 0 ? numPasses / results.length : 0,
      isPromptfooSampleTarget: Boolean(isSampleTarget),
      loadedFromCloud: Boolean(options.loadedFromCloud),
    });
  }

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

  // Clear the callback when done
  setLogCallback(null);
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
