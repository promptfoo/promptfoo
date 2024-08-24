#!/usr/bin/env node
import { Command } from 'commander';
import path from 'path';
import { checkNodeVersion } from './checkNodeVersion';
import { cacheCommand } from './commands/cache';
import { configCommand } from './commands/config';
import { deleteCommand } from './commands/delete';
import { evalCommand } from './commands/eval';
import { exportCommand } from './commands/export';
import { feedbackCommand } from './commands/feedback';
import { generateDatasetCommand } from './commands/generate/dataset';
import { generateRedteamCommand } from './commands/generate/redteam';
import { importCommand } from './commands/import';
import { initCommand } from './commands/init';
import { listCommand } from './commands/list';
import { initRedteamCommand } from './commands/redteam';
import { shareCommand } from './commands/share';
import { showCommand } from './commands/show';
import { versionCommand } from './commands/version';
import { viewCommand } from './commands/view';
import { maybeReadConfig } from './config';
import { type EvaluateOptions, type UnifiedConfig } from './types';
import { checkForUpdates } from './updates';

export async function loadDefaultConfig(): Promise<{
  defaultConfig: Partial<UnifiedConfig>;
  defaultConfigPath: string | undefined;
}> {
  const pwd = process.cwd();
  let defaultConfig: Partial<UnifiedConfig> = {};
  let defaultConfigPath: string | undefined;

  // NOTE: sorted by frequency of use
  const extensions = ['yaml', 'yml', 'json', 'cjs', 'cts', 'js', 'mjs', 'mts', 'ts'];
  for (const ext of extensions) {
    const configPath = path.join(pwd, `promptfooconfig.${ext}`);
    const maybeConfig = await maybeReadConfig(configPath);
    if (maybeConfig) {
      defaultConfig = maybeConfig;
      defaultConfigPath = configPath;
      break;
    }
  }

  return { defaultConfig, defaultConfigPath };
}

async function main() {
  await checkForUpdates();

  const program = new Command();

  const { defaultConfig, defaultConfigPath } = await loadDefaultConfig();

  const evaluateOptions: EvaluateOptions = {};
  if (defaultConfig.evaluateOptions) {
    evaluateOptions.generateSuggestions = defaultConfig.evaluateOptions.generateSuggestions;
    evaluateOptions.maxConcurrency = defaultConfig.evaluateOptions.maxConcurrency;
    evaluateOptions.showProgressBar = defaultConfig.evaluateOptions.showProgressBar;
  }

  cacheCommand(program);
  configCommand(program);
  deleteCommand(program);
  evalCommand(program, defaultConfig, defaultConfigPath, evaluateOptions);
  exportCommand(program);
  feedbackCommand(program);
  importCommand(program);
  initCommand(program);
  listCommand(program);
  shareCommand(program);
  showCommand(program);
  versionCommand(program);
  viewCommand(program);

  const generateCommand = program.command('generate').description('Generate synthetic data');
  generateDatasetCommand(generateCommand, defaultConfig, defaultConfigPath);
  generateRedteamCommand(generateCommand, 'redteam', defaultConfig, defaultConfigPath);

  const redteamBaseCommand = program.command('redteam').description('Red team LLM applications');
  initRedteamCommand(redteamBaseCommand);
  generateRedteamCommand(redteamBaseCommand, 'generate', defaultConfig, defaultConfigPath);

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
