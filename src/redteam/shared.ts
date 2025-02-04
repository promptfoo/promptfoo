import chalk from 'chalk';
import * as fs from 'fs';
import yaml from 'js-yaml';
import * as os from 'os';
import * as path from 'path';
import { doEval } from '../commands/eval';
import logger, { setLogCallback, setLogLevel } from '../logger';
import type Eval from '../models/eval';
import { createShareableUrl } from '../share';
import { isRunningUnderNpx } from '../util';
import { loadDefaultConfig } from '../util/config/default';
import { doGenerateRedteam } from './commands/generate';
import type { RedteamRunOptions } from './types';

export async function doRedteamRun(options: RedteamRunOptions): Promise<Eval | undefined> {
  if (options.verbose) {
    setLogLevel('debug');
  }
  if (options.logCallback) {
    setLogCallback(options.logCallback);
  }

  let configPath: string | undefined = options.config || 'promptfooconfig.yaml';
  let redteamPath = options.output || 'redteam.yaml';

  if (options.liveRedteamConfig) {
    // Write liveRedteamConfig to a temporary file
    const tmpFile = path.join(os.tmpdir(), `redteam-${Date.now()}`) + '/redteam.yaml';
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
  const redteamConfig = await doGenerateRedteam({
    ...options,
    config: configPath,
    output: redteamPath,
    force: options.force,
    verbose: options.verbose,
    delay: options.delay,
    inRedteamRun: true,
    abortSignal: options.abortSignal,
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
      showProgressBar: true,
      abortSignal: options.abortSignal,
    },
  );

  logger.info(chalk.green('\nRed team scan complete!'));
  const command = isRunningUnderNpx() ? 'npx promptfoo' : 'promptfoo';
  if (options.loadedFromCloud) {
    const url = await createShareableUrl(evalResult, false);
    logger.info(`View results: ${chalk.greenBright.bold(url)}`);
  } else {
    if (options.liveRedteamConfig) {
      logger.info(
        chalk.blue(
          `To view the results, click the ${chalk.bold('View Report')} button or run ${chalk.bold(`${command} redteam report`)} on the command line.`,
        ),
      );
    } else {
      logger.info(
        chalk.blue(`To view the results, run ${chalk.bold(`${command} redteam report`)}`),
      );
    }
  }

  // Clear the callback when done
  setLogCallback(null);
  return evalResult;
}
