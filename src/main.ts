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
import { generateAssertionsCommand } from './commands/generate/assertions';
import { generateDatasetCommand } from './commands/generate/dataset';
import { importCommand } from './commands/import';
import { initCommand } from './commands/init';
import { listCommand } from './commands/list';
import { mcpCommand } from './commands/mcp/index';
import { modelScanCommand } from './commands/modelScan';
import { shareCommand } from './commands/share';
import { showCommand } from './commands/show';
import { validateCommand } from './commands/validate';
import { viewCommand } from './commands/view';
import logger, { setLogLevel } from './logger';
import { discoverCommand as redteamDiscoverCommand } from './redteam/commands/discover';
import { redteamGenerateCommand } from './redteam/commands/generate';
import { initCommand as redteamInitCommand } from './redteam/commands/init';
import { pluginsCommand as redteamPluginsCommand } from './redteam/commands/plugins';
import { redteamReportCommand } from './redteam/commands/report';
import { redteamRunCommand } from './redteam/commands/run';
import { redteamSetupCommand } from './redteam/commands/setup';
import { simbaCommand } from './redteam/commands/simba';
import { checkForUpdatesDeferred } from './updates-deferred';
import { setupEnv } from './util';

/**
 * Adds verbose and env-file options to all commands recursively
 */
export function addCommonOptionsRecursively(command: Command) {
  const hasVerboseOption = command.options.some(
    (option) => option.short === '-v' || option.long === '--verbose',
  );
  if (!hasVerboseOption) {
    command.option('-v, --verbose', 'Show debug logs', false);
  }

  const hasEnvFileOption = command.options.some(
    (option) => option.long === '--env-file' || option.long === '--env-path',
  );
  if (!hasEnvFileOption) {
    command.option('--env-file, --env-path <path>', 'Path to .env file');
  }

  command.hook('preAction', (thisCommand) => {
    if (thisCommand.opts().verbose) {
      setLogLevel('debug');
      logger.debug('Verbose mode enabled via --verbose flag');
    }

    const envPath = thisCommand.opts().envFile || thisCommand.opts().envPath;
    if (envPath) {
      setupEnv(envPath);
      logger.debug(`Loading environment from ${envPath}`);
    }
  });

  command.commands.forEach((subCommand) => {
    addCommonOptionsRecursively(subCommand);
  });
}

async function main() {
  // Analyze command to optimize startup
  const commandArg = process.argv[2];
  const hasHelpFlag = process.argv.includes('--help') || process.argv.includes('-h');
  const hasVersionFlag = process.argv.includes('--version') || process.argv.includes('-V');
  const isHelpCommand = !commandArg || commandArg === 'help' || hasHelpFlag;
  const isVersionCommand = commandArg === 'version' || hasVersionFlag;
  const isQuickCommand = isHelpCommand || isVersionCommand;
  
  // Commands that need database access
  const needsDatabase = ['eval', 'import', 'export', 'delete', 'list', 'show', 'share', 'view'].includes(commandArg || '');
  
  // Commands where update check is useful (long-running primary commands)
  const shouldCheckUpdates = ['eval', 'view', 'redteam'].includes(commandArg || '');

  // 1. Update check - non-blocking for appropriate commands
  if (shouldCheckUpdates && !isQuickCommand) {
    // Fire and forget - don't await, runs every time
    checkForUpdatesDeferred().catch(() => {
      // Silently ignore update check failures
    });
  }

  // 2. Database migrations - defer or run as promise
  let dbMigrationPromise: Promise<void> | null = null;
  
  if (needsDatabase && !isQuickCommand) {
    // Start migrations but don't await yet
    dbMigrationPromise = import('./migrate').then(m => m.runDbMigrations());
  }

  // 3. Config loading - defer until needed
  let configPromise: Promise<{ defaultConfig: any; defaultConfigPath: string | undefined }> | null = null;
  let defaultConfig: any = {};
  let defaultConfigPath: string | undefined;
  
  // Start loading config for commands that need it (non-blocking)
  const needsConfig = ['eval', 'debug', 'validate', 'generate', 'redteam'].includes(commandArg || '');
  
  if (needsConfig && !isQuickCommand) {
    // Start loading but don't await
    configPromise = import('./util/config/default').then(m => m.loadDefaultConfig());
  }

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

  // If we need config, await it before registering commands
  if (configPromise) {
    const config = await configPromise;
    defaultConfig = config.defaultConfig;
    defaultConfigPath = config.defaultConfigPath;
  }

  // Main commands
  evalCommand(program, defaultConfig, defaultConfigPath);
  initCommand(program);
  viewCommand(program);
  mcpCommand(program);
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
  validateCommand(program);
  showCommand(program);

  generateDatasetCommand(generateCommand);
  generateAssertionsCommand(generateCommand);
  redteamGenerateCommand(generateCommand, 'redteam', defaultConfig, defaultConfigPath);

  // Load redteam config only if needed
  let redteamConfig = defaultConfig;
  let redteamConfigPath = defaultConfigPath;
  
  if (commandArg === 'redteam' && !isQuickCommand) {
    const { loadDefaultConfig } = await import('./util/config/default');
    const config = await loadDefaultConfig(undefined, 'redteam');
    redteamConfig = config.defaultConfig ?? defaultConfig;
    redteamConfigPath = config.defaultConfigPath ?? defaultConfigPath;
  }

  redteamInitCommand(redteamBaseCommand);
  evalCommand(
    redteamBaseCommand,
    redteamConfig ?? defaultConfig,
    redteamConfigPath ?? defaultConfigPath,
  );
  redteamDiscoverCommand(redteamBaseCommand, defaultConfig, defaultConfigPath);
  redteamGenerateCommand(redteamBaseCommand, 'generate', defaultConfig, defaultConfigPath);
  redteamRunCommand(redteamBaseCommand);
  redteamReportCommand(redteamBaseCommand);
  redteamSetupCommand(redteamBaseCommand);
  redteamPluginsCommand(redteamBaseCommand);
  simbaCommand(redteamBaseCommand, defaultConfig);
  // Add common options to all commands recursively
  addCommonOptionsRecursively(program);

  // Add hook to ensure database is ready for commands that need it
  if (dbMigrationPromise) {
    program.hook('preAction', async (thisCommand) => {
      const cmdName = thisCommand.name();
      if (['eval', 'import', 'export', 'delete', 'list', 'show', 'share', 'view'].includes(cmdName)) {
        await dbMigrationPromise;
      }
    });
  }

  program.parse();
}

if (require.main === module) {
  (async () => {
    await checkNodeVersion();
    main();
  })();
}
