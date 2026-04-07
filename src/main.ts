import { Command } from 'commander';
import cliState from './cliState';
import { codeScansCommand } from './codeScan/index';
import { authCommand } from './commands/auth';
import { cacheCommand } from './commands/cache';
import { configCommand } from './commands/config';
import { debugCommand } from './commands/debug';
import { deleteCommand } from './commands/delete';
import { evalCommand } from './commands/eval';
import { evalSetupCommand } from './commands/evalSetup';
import { exportCommand } from './commands/export';
import { feedbackCommand } from './commands/feedback';
import { generateAssertionsCommand } from './commands/generate/assertions';
import { generateDatasetCommand } from './commands/generate/dataset';
import { importCommand } from './commands/import';
import { initCommand } from './commands/init';
import { listCommand } from './commands/list';
import { logsCommand } from './commands/logs';
import { mcpCommand } from './commands/mcp/index';
import { modelScanCommand } from './commands/modelScan';
import { setupRetryCommand } from './commands/retry';
import { shareCommand } from './commands/share';
import { showCommand } from './commands/show';
import { validateCommand } from './commands/validate';
import { viewCommand } from './commands/view';
import logger, { initializeRunLogging } from './logger';
import {
  addCommonOptionsRecursively,
  isMainModule,
  setupEnvFilesFromArgv,
  shutdownGracefully,
} from './mainUtils';
import { runDbMigrations } from './migrate';
import { discoverCommand as redteamDiscoverCommand } from './redteam/commands/discover';
import { redteamGenerateCommand } from './redteam/commands/generate';
import { initCommand as redteamInitCommand } from './redteam/commands/init';
import { pluginsCommand as redteamPluginsCommand } from './redteam/commands/plugins';
import { redteamReportCommand } from './redteam/commands/report';
import { redteamRunCommand } from './redteam/commands/run';
import { redteamSetupCommand } from './redteam/commands/setup';
import { checkForUpdates } from './updates';
import { loadDefaultConfig } from './util/config/default';
import { printErrorInformation } from './util/errors/index';
import { VERSION } from './version';

async function main() {
  setupEnvFilesFromArgv();
  initializeRunLogging();

  // Set PROMPTFOO_DISABLE_UPDATE=true in CI to prevent hanging on network requests
  if (!process.env.PROMPTFOO_DISABLE_UPDATE && typeof process.env.CI !== 'undefined') {
    process.env.PROMPTFOO_DISABLE_UPDATE = 'true';
  }

  await checkForUpdates();
  await runDbMigrations();

  const { defaultConfig, defaultConfigPath } = await loadDefaultConfig();

  const program = new Command('promptfoo');
  program
    .version(VERSION)
    .showHelpAfterError()
    .showSuggestionAfterError()
    .on('option:*', function (this: Command) {
      const unknownArgs = this.args.filter((arg) => arg.startsWith('-'));
      if (unknownArgs.length > 0) {
        logger.error(`Invalid option(s): ${unknownArgs.join(', ')}`);
      } else {
        logger.error('Invalid option(s)');
      }
      program.help();
      process.exitCode = 1;
    });

  // Main commands
  const evalCmd = evalCommand(program, defaultConfig, defaultConfigPath);
  evalSetupCommand(evalCmd);
  initCommand(program);
  viewCommand(program);
  mcpCommand(program);
  const redteamBaseCommand = program.command('redteam').description('Red team LLM applications');
  shareCommand(program);

  // Alphabetical order
  authCommand(program);
  cacheCommand(program);
  codeScansCommand(program);
  configCommand(program);
  debugCommand(program, defaultConfig, defaultConfigPath);
  deleteCommand(program);
  exportCommand(program);
  const generateCommand = program.command('generate').description('Generate synthetic data');
  feedbackCommand(program);
  importCommand(program);
  listCommand(program);
  logsCommand(program);
  modelScanCommand(program);
  setupRetryCommand(program);
  validateCommand(program, defaultConfig, defaultConfigPath);
  void showCommand(program);

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
  // Add common options to all commands recursively
  addCommonOptionsRecursively(program);

  program.hook('postAction', async () => {
    printErrorInformation(cliState.errorLogFile, cliState.debugLogFile);

    if (cliState.postActionCallback) {
      await cliState.postActionCallback();
    }
  });

  await program.parseAsync();
}

// ESM replacement for require.main === module check
// Check if this module is being run directly (not imported)
// The isMainModule check may throw in CJS builds where import.meta.url is not available
let isMain = false;
try {
  isMain = isMainModule(import.meta.url, process.argv[1]);
} catch {
  // In CJS builds, import.meta.url throws - CJS entry point is handled differently
}

if (isMain) {
  let mainError: unknown;
  try {
    await main();
  } catch (error) {
    mainError = error;
    // Set exit code immediately so watchdog timeouts preserve the error state
    process.exitCode = 1;
  } finally {
    try {
      await shutdownGracefully();
    } catch (shutdownError) {
      // Log shutdown error but preserve the original main error if it exists
      logger.error(
        `Shutdown error: ${shutdownError instanceof Error ? shutdownError.message : shutdownError}`,
      );
    }
  }
  // Re-throw the original error after cleanup is complete
  if (mainError) {
    throw mainError;
  }
}
