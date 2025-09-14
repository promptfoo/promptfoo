import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Command } from 'commander';
import pkg from '../package.json' with { type: 'json' };
const { version } = pkg;
import { checkNodeVersion } from './checkNodeVersion.js';
import { authCommand } from './commands/auth.js';
import { cacheCommand } from './commands/cache.js';
import { configCommand } from './commands/config.js';
import { debugCommand } from './commands/debug.js';
import { deleteCommand } from './commands/delete.js';
import { evalCommand } from './commands/eval.js';
import { exportCommand } from './commands/export.js';
import { feedbackCommand } from './commands/feedback.js';
import { generateAssertionsCommand } from './commands/generate/assertions.js';
import { generateDatasetCommand } from './commands/generate/dataset.js';
import { importCommand } from './commands/import.js';
import { initCommand } from './commands/init.js';
import { listCommand } from './commands/list.js';
import { mcpCommand } from './commands/mcp/index.js';
import { modelScanCommand } from './commands/modelScan.js';
import { shareCommand } from './commands/share.js';
import { showCommand } from './commands/show.js';
import { validateCommand } from './commands/validate.js';
import { viewCommand } from './commands/view.js';
import logger, { initializeRunLogging, setLogLevel } from './logger.js';
import { runDbMigrations } from './migrate.js';
import { discoverCommand as redteamDiscoverCommand } from './redteam/commands/discover.js';
import { redteamGenerateCommand } from './redteam/commands/generate.js';
import { initCommand as redteamInitCommand } from './redteam/commands/init.js';
import { pluginsCommand as redteamPluginsCommand } from './redteam/commands/plugins.js';
import { redteamReportCommand } from './redteam/commands/report.js';
import { redteamRunCommand } from './redteam/commands/run.js';
import { redteamSetupCommand } from './redteam/commands/setup.js';
import { simbaCommand } from './redteam/commands/simba.js';
import { checkForUpdates } from './updates.js';
import { setupEnv } from './util/index.js';
import { loadDefaultConfig } from './util/config/default.js';

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
  initializeRunLogging();

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
  validateCommand(program, defaultConfig, defaultConfigPath);
  showCommand(program);

  generateDatasetCommand(generateCommand, defaultConfig, defaultConfigPath);
  generateAssertionsCommand(generateCommand, defaultConfig, defaultConfigPath);
  redteamGenerateCommand(generateCommand, 'redteam', defaultConfig, defaultConfigPath);

  const { defaultConfig: redteamConfig, defaultConfigPath: redteamConfigPath } =
    await loadDefaultConfig(undefined, 'redteam');

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

  program.parse();
}

// ESM replacement for require.main === module check
if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  checkNodeVersion();
  main();
}
