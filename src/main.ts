#!/usr/bin/env node
import chalk from 'chalk';
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { clearCache } from './cache';
import { checkNodeVersion } from './checkNodeVersion';
import { configCommand } from './commands/config';
import { deleteCommand } from './commands/delete';
import { evalCommand } from './commands/eval';
import { exportCommand } from './commands/export';
import { generateCommand } from './commands/generate';
import { importCommand } from './commands/import';
import { listCommand } from './commands/list';
import { redteamCommand } from './commands/redteam';
import { showCommand } from './commands/show';
import { maybeReadConfig } from './config';
import { getDirectory } from './esm';
import { gatherFeedback } from './feedback';
import logger from './logger';
import { createDummyFiles } from './onboarding';
import { createShareableUrl } from './share';
import telemetry from './telemetry';
import { type EvaluateOptions, type UnifiedConfig } from './types';
import { checkForUpdates } from './updates';
import { cleanupOldFileResults, readLatestResults, setConfigDirectoryPath, setupEnv } from './util';
import { BrowserBehavior, startServer } from './web/server';

async function main() {
  await checkForUpdates();

  const pwd = process.cwd();
  const potentialPaths = [
    path.join(pwd, 'promptfooconfig.js'),
    path.join(pwd, 'promptfooconfig.json'),
    path.join(pwd, 'promptfooconfig.yaml'),
    path.join(pwd, 'promptfooconfig.yml'),
  ];
  let defaultConfig: Partial<UnifiedConfig> = {};
  let defaultConfigPath: string | undefined;
  for (const _path of potentialPaths) {
    const maybeConfig = await maybeReadConfig(_path);
    if (maybeConfig) {
      defaultConfig = maybeConfig;
      defaultConfigPath = _path;
      break;
    }
  }

  const evaluateOptions: EvaluateOptions = {};
  if (defaultConfig.evaluateOptions) {
    evaluateOptions.generateSuggestions = defaultConfig.evaluateOptions.generateSuggestions;
    evaluateOptions.maxConcurrency = defaultConfig.evaluateOptions.maxConcurrency;
    evaluateOptions.showProgressBar = defaultConfig.evaluateOptions.showProgressBar;
    evaluateOptions.interactiveProviders = defaultConfig.evaluateOptions.interactiveProviders;
  }

  const program = new Command();

  program.option('--version', 'Print version', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(getDirectory(), '../package.json'), 'utf8'),
    );
    logger.info(packageJson.version);
    process.exit(0);
  });

  program
    .command('init [directory]')
    .description('Initialize project with dummy files')
    .option('--no-interactive', 'Run in interactive mode')
    .action(async (directory: string | null, cmdObj: { interactive: boolean }) => {
      telemetry.maybeShowNotice();
      telemetry.record('command_used', {
        name: 'init - started',
      });
      const details = await createDummyFiles(directory, cmdObj.interactive);
      telemetry.record('command_used', {
        ...details,
        name: 'init',
      });
      await telemetry.send();
    });

  program
    .command('view [directory]')
    .description('Start browser ui')
    .option('-p, --port <number>', 'Port number', '15500')
    .option('-y, --yes', 'Skip confirmation and auto-open the URL')
    .option('-n, --no', 'Skip confirmation and do not open the URL')
    .option('--api-base-url <url>', 'Base URL for viewer API calls')
    .option('--filter-description <pattern>', 'Filter evals by description using a regex pattern')
    .option('--env-file <path>', 'Path to .env file')
    .action(
      async (
        directory: string | undefined,
        cmdObj: {
          port: number;
          yes: boolean;
          no: boolean;
          apiBaseUrl?: string;
          envFile?: string;
          filterDescription?: string;
        } & Command,
      ) => {
        setupEnv(cmdObj.envFile);
        telemetry.maybeShowNotice();
        telemetry.record('command_used', {
          name: 'view',
        });
        await telemetry.send();

        if (directory) {
          setConfigDirectoryPath(directory);
        }
        // Block indefinitely on server
        const browserBehavior = cmdObj.yes
          ? BrowserBehavior.OPEN
          : cmdObj.no
            ? BrowserBehavior.SKIP
            : BrowserBehavior.ASK;
        await startServer(
          cmdObj.port,
          cmdObj.apiBaseUrl,
          browserBehavior,
          cmdObj.filterDescription,
        );
      },
    );

  program
    .command('share')
    .description('Create a shareable URL of your most recent eval')
    .option('-y, --yes', 'Skip confirmation')
    .option('--env-file <path>', 'Path to .env file')
    .action(async (cmdObj: { yes: boolean; envFile?: string } & Command) => {
      setupEnv(cmdObj.envFile);
      telemetry.maybeShowNotice();
      telemetry.record('command_used', {
        name: 'share',
      });
      await telemetry.send();

      const createPublicUrl = async () => {
        const latestResults = await readLatestResults();
        if (!latestResults) {
          logger.error('Could not load results. Do you need to run `promptfoo eval` first?');
          process.exit(1);
        }
        const url = await createShareableUrl(latestResults.results, latestResults.config);
        logger.info(`View results: ${chalk.greenBright.bold(url)}`);
      };

      if (cmdObj.yes || process.env.PROMPTFOO_DISABLE_SHARE_WARNING) {
        createPublicUrl();
      } else {
        const reader = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        reader.question(
          'Create a private shareable URL of your most recent eval?\n\nTo proceed, please confirm [Y/n] ',
          async function (answer: string) {
            if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y' && answer !== '') {
              reader.close();
              process.exit(1);
            }
            reader.close();

            createPublicUrl();
          },
        );
      }
    });

  program
    .command('cache')
    .description('Manage cache')
    .command('clear')
    .description('Clear cache')
    .option('--env-file <path>', 'Path to .env file')
    .action(async (cmdObj: { envFile?: string }) => {
      setupEnv(cmdObj.envFile);
      telemetry.maybeShowNotice();
      logger.info('Clearing cache...');
      await clearCache();
      cleanupOldFileResults(0);
      telemetry.record('command_used', {
        name: 'cache_clear',
      });
      await telemetry.send();
    });

  program
    .command('feedback [message]')
    .description('Send feedback to the promptfoo developers')
    .action((message?: string) => {
      gatherFeedback(message);
    });

  configCommand(program);
  deleteCommand(program);
  evalCommand(program, defaultConfig, defaultConfigPath, evaluateOptions);
  exportCommand(program);
  generateCommand(program, defaultConfig, defaultConfigPath);
  importCommand(program);
  listCommand(program);
  redteamCommand(program);
  showCommand(program);

  program.parse(process.argv);

  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
}

if (require.main === module) {
  checkNodeVersion();
  main();
}
