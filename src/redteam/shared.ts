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

  // Validate generated test cases have usable prompts before running evaluation
  // This catches issues like variable mismatches (e.g., prompts use {{prompt}} but injectVar is 'query')
  try {
    const generatedConfig = yaml.load(fs.readFileSync(redteamPath, 'utf8')) as {
      tests?: Array<{ vars?: Record<string, unknown> }>;
      prompts?: string[];
    };

    if (generatedConfig?.tests && generatedConfig.tests.length > 0) {
      // Check if prompts are still templates (contain {{...}} without vars to fill them)
      const promptsAreTemplates = generatedConfig.prompts?.some((p) =>
        /\{\{[^}]+\}\}/.test(String(p)),
      );

      // Check if any test case has vars that would fill the template
      const firstTest = generatedConfig.tests[0];

      // If prompts are templates but tests have no vars, or vars don't match template variables
      if (promptsAreTemplates && generatedConfig.prompts) {
        // Extract variable names from prompt templates
        const templateVars = new Set<string>();
        for (const prompt of generatedConfig.prompts) {
          const matches = String(prompt).matchAll(/\{\{([^}]+)\}\}/g);
          for (const match of matches) {
            templateVars.add(match[1].trim());
          }
        }

        // Check if test vars contain the template variables
        const testVarKeys = new Set(Object.keys(firstTest?.vars || {}));
        const missingVars = [...templateVars].filter((v) => !testVarKeys.has(v));

        if (missingVars.length > 0) {
          logger.error(
            chalk.red(
              `\n❌ Error: Generated test cases are missing required variables.\n\n` +
                `Your prompts use: ${[...templateVars].join(', ')}\n` +
                `Generated tests have: ${[...testVarKeys].join(', ') || '(none)'}\n` +
                `Missing: ${missingVars.join(', ')}\n\n` +
                `This typically happens when your prompt template uses a different variable ` +
                `than the redteam injectVar (default: 'query').\n\n` +
                `To fix this, either:\n` +
                `  1. Change your prompts to use {{query}} instead of {{${missingVars[0]}}}\n` +
                `  2. Set 'injectVar: ${missingVars[0]}' in your redteam config\n`,
            ),
          );
          return;
        }
      }
    }
  } catch (error) {
    logger.debug(`Error validating generated config: ${error}`);
    // Continue with evaluation - let the grader handle any issues
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
