import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import chalk from 'chalk';
import yaml from 'js-yaml';
import { doEval } from '../commands/eval';
import logger, { setLogCallback, setLogLevel } from '../logger';
import telemetry from '../telemetry';
import { checkRemoteHealth } from '../util/apiHealth';
import { loadDefaultConfig } from '../util/config/default';
import { promptfooCommand } from '../util/promptfooCommand';
import { initVerboseToggle } from '../util/verboseToggle';
import { doGenerateRedteam } from './commands/generate';
import { getRemoteHealthUrl } from './remoteGeneration';
import { PartialGenerationError } from './types';

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

  let redteamConfig;
  try {
    redteamConfig = await doGenerateRedteam({
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
      // Log the detailed error message - this will be visible in CLI and UI (via logCallback)
      logger.error(chalk.red('\n' + error.message));
      setLogCallback(null);
      if (verboseToggleCleanup) {
        verboseToggleCleanup();
      }
      // Re-throw so CLI exits with non-zero code and callers can handle appropriately
      throw error;
    }
    // Re-throw other errors
    throw error;
  }

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

  // Record completion telemetry with full results
  if (evalResult) {
    const results = evalResult.results || [];
    const numPasses = results.filter((r) => r.success).length;
    const numFails = results.filter((r) => !r.success && !r.error).length;
    const numErrors = results.filter((r) => r.error).length;

    // Get config info from liveRedteamConfig or try to extract from results
    const config = options.liveRedteamConfig;
    const plugins =
      (config?.plugins as Array<string | { id: string }>)?.map((p: string | { id: string }) =>
        typeof p === 'string' ? p : p.id,
      ) || [];
    const strategies =
      (config?.strategies as Array<string | { id: string }>)?.map((s: string | { id: string }) =>
        typeof s === 'string' ? s : s.id,
      ) || [];

    // Check if using sample target (promptfoo: prefix or promptfoo.app URL)
    // Note: targets can be a single string, function, or array per ProvidersSchema
    const checkIsSampleTarget = (t: unknown): boolean => {
      if (typeof t === 'string') {
        return t.includes('promptfoo:') || t.includes('promptfoo.app');
      }
      if (typeof t === 'object' && t !== null) {
        const obj = t as { id?: string; config?: { url?: string } };
        const id = obj.id || '';
        const url = obj.config?.url || '';
        return (
          id.includes('promptfoo:') ||
          url.includes('promptfoo.app') ||
          url.includes('promptfoo.dev')
        );
      }
      return false;
    };

    const targets = config?.targets;
    const isSampleTarget =
      typeof targets === 'string'
        ? checkIsSampleTarget(targets)
        : Array.isArray(targets)
          ? targets.some(checkIsSampleTarget)
          : false;

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
