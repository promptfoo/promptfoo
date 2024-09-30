#!/usr/bin/env node
import { Command } from 'commander';
import { version } from '../package.json';
import { checkNodeVersion } from './checkNodeVersion';
import { authCommand } from './commands/auth';
import { cacheCommand } from './commands/cache';
import { configCommand } from './commands/config';
import { deleteCommand } from './commands/delete';
import { evalCommand } from './commands/eval';
import { exportCommand } from './commands/export';
import { feedbackCommand } from './commands/feedback';
import { generateDatasetCommand } from './commands/generate/dataset';
import { importCommand } from './commands/import';
import { initCommand } from './commands/init';
import { listCommand } from './commands/list';
import { shareCommand } from './commands/share';
import { showCommand } from './commands/show';
import { viewCommand } from './commands/view';
import { runDbMigrations } from './migrate';
import { redteamGenerateCommand } from './redteam/commands/generate';
import { initCommand as redteamInitCommand } from './redteam/commands/init';
import { pluginsCommand as redteamPluginsCommand } from './redteam/commands/plugins';
import { redteamReportCommand } from './redteam/commands/report';
import { redteamRunCommand } from './redteam/commands/run';
import { checkForUpdates } from './updates';
import { loadDefaultConfig } from './util/config/default';

async function main() {
  await checkForUpdates();
  await runDbMigrations();

  const { defaultConfig, defaultConfigPath } = await loadDefaultConfig();

  const program = new Command();
  program.version(version);

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
  deleteCommand(program);
  exportCommand(program);
  feedbackCommand(program);
  const generateCommand = program.command('generate').description('Generate synthetic data');
  importCommand(program);
  listCommand(program);
  showCommand(program);

  generateDatasetCommand(generateCommand, defaultConfig, defaultConfigPath);
  redteamGenerateCommand(generateCommand, 'redteam', defaultConfig, defaultConfigPath);

  redteamInitCommand(redteamBaseCommand);
  evalCommand(redteamBaseCommand, defaultConfig, defaultConfigPath);
  redteamGenerateCommand(redteamBaseCommand, 'generate', defaultConfig, defaultConfigPath);
  redteamPluginsCommand(redteamBaseCommand);
  redteamRunCommand(redteamBaseCommand);
  redteamReportCommand(redteamBaseCommand);

  program.parse();
}

if (require.main === module) {
  checkNodeVersion();
  main();
}
