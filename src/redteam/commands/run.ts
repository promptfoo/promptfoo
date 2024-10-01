import chalk from 'chalk';
import type { Command } from 'commander';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { z } from 'zod';
import packageJson from '../../../package.json';
import cliState from '../../cliState';
import { doEval } from '../../commands/eval';
import logger from '../../logger';
import telemetry from '../../telemetry';
import type { CommandLineOptions, RedteamCliGenerateOptions } from '../../types';
import { setupEnv } from '../../util';
import { loadDefaultConfig } from '../../util/config/default';
import { doGenerateRedteam } from './generate';
import { redteamInit } from './init';

interface RedteamRunOptions {
  config?: string;
  output?: string;
  cache?: boolean;
  envPath?: string;
  maxConcurrency?: number;
  delay?: number;
  remote?: boolean;
}

function getConfigHash(configPath: string): string {
  const content = fs.readFileSync(configPath, 'utf8');
  const version = packageJson.version;
  return createHash('md5').update(`${version}:${content}`).digest('hex');
}

async function doRedteamRun(options: RedteamRunOptions) {
  const configPath = options.config || 'promptfooconfig.yaml';
  const redteamPath = options.output || 'redteam.yaml';

  // Check if promptfooconfig.yaml exists, if not, run init
  if (!fs.existsSync(configPath)) {
    logger.info('No configuration file found. Running initialization...');
    await redteamInit(undefined);
    // User probably needs to edit init and stuff, so it is premature to generate and eval.
    return;
  }

  // Check for updates to the config file and regenerate redteam if necessary
  let shouldGenerate = true;
  if (fs.existsSync(redteamPath)) {
    const redteamContent = yaml.load(fs.readFileSync(redteamPath, 'utf8')) as any;
    const storedHash = redteamContent.metadata?.configHash;
    const currentHash = getConfigHash(configPath);

    if (storedHash === currentHash) {
      shouldGenerate = false;
    }
  }

  if (shouldGenerate) {
    logger.info('Generating new test cases...');
    await doGenerateRedteam({
      ...options,
      config: configPath,
      output: redteamPath,
    } as Partial<RedteamCliGenerateOptions>);

    // Update redteam.yaml with the new config hash
    const redteamContent = yaml.load(fs.readFileSync(redteamPath, 'utf8')) as any;
    redteamContent.metadata = {
      ...redteamContent.metadata,
      configHash: getConfigHash(configPath),
    };
    fs.writeFileSync(redteamPath, yaml.dump(redteamContent));
  } else {
    logger.info('Using existing test cases...');
  }

  // Run evaluation
  const { defaultConfig } = await loadDefaultConfig();
  await doEval(
    {
      ...options,
      config: [redteamPath],
      cache: true, // Enable caching
      write: true, // Write results to database
    } as Partial<CommandLineOptions & Command>,
    defaultConfig,
    redteamPath,
    {
      showProgressBar: true,
    },
  );

  logger.info(chalk.green('\nRed team evaluation complete!'));
  logger.info(chalk.blue('To view the results, run: ') + chalk.bold('promptfoo redteam report'));
}

export function redteamRunCommand(program: Command) {
  program
    .command('run')
    .description('Run red teaming process (init, generate, and evaluate)')
    .option('-c, --config [path]', 'Path to configuration file. Defaults to promptfooconfig.yaml')
    .option(
      '-o, --output [path]',
      'Path to output file for generated tests. Defaults to redteam.yaml',
    )
    .option('--no-cache', 'Do not read or write results to disk cache', false)
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .option('-j, --max-concurrency <number>', 'Maximum number of concurrent API calls', (val) =>
      Number.parseInt(val, 10),
    )
    .option('--delay <number>', 'Delay in milliseconds between API calls', (val) =>
      Number.parseInt(val, 10),
    )
    .option('--remote', 'Force remote inference wherever possible', false)
    .action(async (opts: RedteamRunOptions) => {
      setupEnv(opts.envPath);
      telemetry.record('command_used', {
        name: 'redteam run',
      });
      await telemetry.send();

      try {
        if (opts.remote) {
          cliState.remote = true;
        }
        await doRedteamRun(opts);
      } catch (error) {
        if (error instanceof z.ZodError) {
          logger.error('Invalid options:');
          error.errors.forEach((err: z.ZodIssue) => {
            logger.error(`  ${err.path.join('.')}: ${err.message}`);
          });
        } else {
          logger.error('An unexpected error occurred:', error);
        }
        process.exit(1);
      }
    });
}
