#!/usr/bin/env node
import { Command } from 'commander';
import { version } from '../package.json';
import { checkNodeVersion } from './checkNodeVersion';
import { authCommand } from './commands/auth';
import { cacheCommand } from './commands/cache';
import { configCommand } from './commands/config';
import { debugCommand } from './commands/debug';
import { deleteCommand } from './commands/delete';
import { evalCommand } from './commands/eval';
import { exportCommand } from './commands/export';
import { feedbackCommand } from './commands/feedback';
import { generateDatasetCommand } from './commands/generate/dataset';
import { importCommand } from './commands/import';
import { initCommand } from './commands/init';
import { listCommand } from './commands/list';
import { modelScanCommand } from './commands/modelScan';
import { shareCommand } from './commands/share';
import { showCommand } from './commands/show';
import { viewCommand } from './commands/view';
import logger, { setLogLevel } from './logger';
import { runDbMigrations } from './migrate';
import { redteamGenerateCommand } from './redteam/commands/generate';
import { initCommand as redteamInitCommand } from './redteam/commands/init';
import { pluginsCommand as redteamPluginsCommand } from './redteam/commands/plugins';
import { redteamReportCommand } from './redteam/commands/report';
import { redteamRunCommand } from './redteam/commands/run';
import { redteamSetupCommand } from './redteam/commands/setup';
import { checkForUpdates } from './updates';
import { setupEnv } from './util';
import { loadDefaultConfig } from './util/config/default';

/**
 * Adds the verbose option to a command and all of its subcommands recursively
 */
function addVerboseOptionRecursively(command: Command) {
  // Add verbose option to the command itself if it doesn't already have one
  const hasVerboseOption = command.options.some(
    (option) => option.short === '-v' || option.long === '--verbose',
  );

  if (!hasVerboseOption) {
    command.option('-v, --verbose', 'Show debug logs', false);
  }

  // Add hook to handle the verbose flag
  command.hook('preAction', (thisCommand) => {
    if (thisCommand.opts().verbose) {
      setLogLevel('debug');
    }
  });

  // Recursively add to all subcommands
  command.commands.forEach((subCommand) => {
    addVerboseOptionRecursively(subCommand);
  });
}

/**
 * Adds the env-file option to a command and all of its subcommands recursively
 */
export function addEnvFileOptionRecursively(command: Command) {
  // Add env-file option to the command itself if it doesn't already have one
  const hasEnvFileOption = command.options.some(
    (option) => option.long === '--env-file' || option.long === '--env-path',
  );

  if (!hasEnvFileOption) {
    command.option('--env-file, --env-path <path>', 'Path to .env file');
  }

  // Add hook to handle the env-file flag
  command.hook('preAction', (thisCommand) => {
    const envPath = thisCommand.opts().envFile || thisCommand.opts().envPath;
    if (envPath) {
      setupEnv(envPath);
    }
  });

  // Recursively add to all subcommands
  command.commands.forEach((subCommand) => {
    addEnvFileOptionRecursively(subCommand);
  });
}

async function main() {
  await checkForUpdates();
  await runDbMigrations();

  const { defaultConfig, defaultConfigPath } = await loadDefaultConfig();

  const program = new Command('promptfoo');
  program
    .version(version)
    .showHelpAfterError()
    .showSuggestionAfterError()
    .on('option:*', function () {
      logger.error('Invalid option(s)');
      program.help();
      process.exitCode = 1;
    });

  // Main commands
  evalCommand(program, defaultConfig, defaultConfigPath);
  initCommand(program);
  viewCommand(program);
  const redteamBaseCommand = program.command('redteam').description('Red team LLM applications');
  shareCommand(program);

  // Alphabetical order
  authCommand(program);
  cacheCommand(program);
  configCommand(program);
  debugCommand(program, defaultConfig, defaultConfigPath);
  deleteCommand(program);
  exportCommand(program);
  const generateCommand = program.command('generate').description('Generate synthetic data');
  feedbackCommand(program);
  importCommand(program);
  listCommand(program);
  modelScanCommand(program);
  showCommand(program);

  generateDatasetCommand(generateCommand, defaultConfig, defaultConfigPath);
  redteamGenerateCommand(generateCommand, 'redteam', defaultConfig, defaultConfigPath);

  const { defaultConfig: redteamConfig, defaultConfigPath: redteamConfigPath } =
    await loadDefaultConfig(undefined, 'redteam');

  redteamInitCommand(redteamBaseCommand);
  evalCommand(
    redteamBaseCommand,
    redteamConfig ?? defaultConfig,
    redteamConfigPath ?? defaultConfigPath,
  );
  redteamGenerateCommand(redteamBaseCommand, 'generate', defaultConfig, defaultConfigPath);
  redteamRunCommand(redteamBaseCommand);
  redteamReportCommand(redteamBaseCommand);
  redteamSetupCommand(redteamBaseCommand);
  redteamPluginsCommand(redteamBaseCommand);

  // Add verbose option to all commands recursively
  // This needs to be done after all commands are defined
  addVerboseOptionRecursively(program);

  // Add env-file option to all commands recursively
  addEnvFileOptionRecursively(program);

  program.parse();
}

if (require.main === module) {
  checkNodeVersion();
  main();
}
