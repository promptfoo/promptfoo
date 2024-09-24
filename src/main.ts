#!/usr/bin/env node
import { Command } from 'commander';
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
import { versionCommand } from './commands/version';
import { viewCommand } from './commands/view';
import { runDbMigrations } from './migrate';
import { generateRedteamCommand } from './redteam/commands/generate';
import { initCommand as redteamInitCommand } from './redteam/commands/init';
import { pluginsCommand as redteamPluginsCommand } from './redteam/commands/plugins';
import { checkForUpdates } from './updates';
import { loadDefaultConfig } from './util/config/default';

async function main() {
  await checkForUpdates();
  await runDbMigrations();

  const { defaultConfig, defaultConfigPath } = await loadDefaultConfig(['promptfooconfig']);

  const program = new Command();

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
  versionCommand(program);

  generateDatasetCommand(generateCommand, defaultConfig, defaultConfigPath);
  generateRedteamCommand(generateCommand, 'redteam', defaultConfig, defaultConfigPath);

  const { defaultConfig: redteamConfig, defaultConfigPath: redteamConfigPath } =
    await loadDefaultConfig(['redteam', 'promptfooconfig']);

  redteamInitCommand(redteamBaseCommand);
  evalCommand(redteamBaseCommand, redteamConfig, redteamConfigPath);
  generateRedteamCommand(redteamBaseCommand, 'generate', defaultConfig, defaultConfigPath);
  redteamPluginsCommand(redteamBaseCommand);

  if (!process.argv.slice(2).length) {
    program.outputHelp();
    process.exit(0);
  }
  program.parse(process.argv);
}

if (require.main === module) {
  checkNodeVersion();
  main();
}
