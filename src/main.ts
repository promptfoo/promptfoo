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
import { generateCommand } from './commands/generate';
import { importCommand } from './commands/import';
import { initCommand } from './commands/init';
import { listCommand } from './commands/list';
import { redteamCommand } from './commands/redteam';
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

  return { defaultConfig, defaultConfigPath };
}

async function main() {
  await checkForUpdates();

  const { defaultConfig, defaultConfigPath } = await loadDefaultConfig();

  const evaluateOptions: EvaluateOptions = {};
  if (defaultConfig.evaluateOptions) {
    evaluateOptions.generateSuggestions = defaultConfig.evaluateOptions.generateSuggestions;
    evaluateOptions.maxConcurrency = defaultConfig.evaluateOptions.maxConcurrency;
    evaluateOptions.showProgressBar = defaultConfig.evaluateOptions.showProgressBar;
    evaluateOptions.interactiveProviders = defaultConfig.evaluateOptions.interactiveProviders;
  }

  const program = new Command();

  cacheCommand(program);
  configCommand(program);
  deleteCommand(program);
  evalCommand(program, defaultConfig, defaultConfigPath, evaluateOptions);
  exportCommand(program);
  feedbackCommand(program);
  generateCommand(program, defaultConfig, defaultConfigPath);
  importCommand(program);
  initCommand(program);
  listCommand(program);
  redteamCommand(program);
  shareCommand(program);
  showCommand(program);
  versionCommand(program);
  viewCommand(program);

  program.parse(process.argv);

  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
}

if (require.main === module) {
  checkNodeVersion();
  main();
}
