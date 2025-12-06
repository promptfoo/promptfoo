import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { getGlobalDispatcher } from 'undici';

import { VERSION } from './version';
import { checkNodeVersion } from './checkNodeVersion';
import cliState from './cliState';
import { codeScansCommand } from './codeScan/index';
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
import { setupRetryCommand } from './commands/retry';
import { shareCommand } from './commands/share';
import { showCommand } from './commands/show';
import { validateCommand } from './commands/validate';
import { viewCommand } from './commands/view';
import { closeDbIfOpen } from './database/index';
import logger, { closeLogger, initializeRunLogging, setLogLevel } from './logger';
import { runDbMigrations } from './migrate';
import { discoverCommand as redteamDiscoverCommand } from './redteam/commands/discover';
import { redteamGenerateCommand } from './redteam/commands/generate';
import { initCommand as redteamInitCommand } from './redteam/commands/init';
import { pluginsCommand as redteamPluginsCommand } from './redteam/commands/plugins';
import { redteamReportCommand } from './redteam/commands/report';
import { redteamRunCommand } from './redteam/commands/run';
import { redteamSetupCommand } from './redteam/commands/setup';
import { simbaCommand } from './redteam/commands/simba';
import telemetry from './telemetry';
import { checkForUpdates } from './updates/updateCheck';
import { handleAutoUpdate, setUpdateHandler } from './updates/handleAutoUpdate';
import { updateCommand } from './commands/update';
import { getEnvBool } from './envars';
import { loadDefaultConfig } from './util/config/default';
import { printErrorInformation } from './util/errors/index';
import { setupEnv } from './util/index';

/**
 * Checks if the current module is the main entry point.
 * Handles npm global bin symlinks by resolving real paths.
 *
 * @param importMetaUrl - The import.meta.url of the module
 * @param processArgv1 - The process.argv[1] value (path to executed script)
 * @returns true if this module is being run directly
 */
export function isMainModule(importMetaUrl: string, processArgv1: string | undefined): boolean {
  if (!processArgv1) {
    return false;
  }

  try {
    // Resolve symlinks for both paths to handle:
    // 1. npm global bin symlinks (process.argv[1] points to symlink)
    // 2. macOS /var -> /private/var symlinks
    const currentModulePath = realpathSync(fileURLToPath(importMetaUrl));
    const mainModulePath = realpathSync(resolve(processArgv1));
    return currentModulePath === mainModulePath;
  } catch {
    // realpathSync throws if path doesn't exist
    return false;
  }
}

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

  // Set PROMPTFOO_DISABLE_UPDATE=true in CI to prevent hanging on network requests
  if (!process.env.PROMPTFOO_DISABLE_UPDATE && typeof process.env.CI !== 'undefined') {
    process.env.PROMPTFOO_DISABLE_UPDATE = 'true';
  }

  // Track event handlers for cleanup
  let cleanupUpdateHandlers: (() => void) | undefined;

  // Cleanup function - only cleans up event handlers, NOT the background update process
  // The update process is detached and unref'd, so it can continue after CLI exits
  const cleanup = () => {
    if (cleanupUpdateHandlers) {
      cleanupUpdateHandlers();
    }
  };

  // Register cleanup handlers only for forced exits (SIGINT/SIGTERM)
  // Don't hook 'exit' because we want background update to continue on normal exit
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130); // Standard exit code for SIGINT
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143); // Standard exit code for SIGTERM
  });

  // Set up update event handlers (for future use by web UI or other consumers)
  cleanupUpdateHandlers = setUpdateHandler(
    (info) => logger.debug(`Update notification: ${info.message}`),
    (info) => logger.info(info.message),
    (info) => logger.warn(info.message),
  );

  // Check for updates and show notification (non-blocking)
  const disableUpdateNag = getEnvBool('PROMPTFOO_DISABLE_UPDATE');
  // Auto-update is opt-in: only enabled if explicitly set to true
  const enableAutoUpdate = getEnvBool('PROMPTFOO_ENABLE_AUTO_UPDATE');

  if (!disableUpdateNag) {
    checkForUpdates()
      .then((info) => {
        if (info) {
          logger.info(info.message);
          logger.info('Run "promptfoo update" to upgrade to the latest version.');

          // Attempt auto-update in background if explicitly enabled
          if (enableAutoUpdate) {
            handleAutoUpdate(info, disableUpdateNag, !enableAutoUpdate, process.cwd());
          }
        }
      })
      .catch((err) => {
        logger.debug(`Failed to check for updates: ${err}`);
      });
  }

  await runDbMigrations();

  const { defaultConfig, defaultConfigPath } = await loadDefaultConfig();

  const program = new Command('promptfoo');
  program
    .version(VERSION)
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
  codeScansCommand(program);
  configCommand(program);
  debugCommand(program, defaultConfig, defaultConfigPath);
  deleteCommand(program);
  exportCommand(program);
  const generateCommand = program.command('generate').description('Generate synthetic data');
  feedbackCommand(program);
  importCommand(program);
  listCommand(program);
  modelScanCommand(program);
  setupRetryCommand(program);
  updateCommand(program);
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

  program.hook('postAction', async () => {
    printErrorInformation(cliState.errorLogFile, cliState.debugLogFile);

    if (cliState.postActionCallback) {
      await cliState.postActionCallback();
    }
  });

  await program.parseAsync();
}

const shutdownGracefully = async () => {
  logger.debug('Shutting down gracefully...');
  await telemetry.shutdown();
  logger.debug('Shutdown complete');

  // Log final messages BEFORE closing logger
  logger.debug('Closing logger file transports');

  // Now close logger silently (no more logging after this point)
  await closeLogger();
  closeDbIfOpen();

  try {
    const dispatcher = getGlobalDispatcher();
    await dispatcher.destroy();
  } catch {
    // Silently handle dispatcher destroy errors
  }

  // Give Node.js time to naturally exit if all handles are closed
  // If there are lingering handles (file watchers, connections, etc), force exit
  // Using .unref() allows natural exit if everything cleans up properly
  const FORCE_EXIT_TIMEOUT_MS = 500;
  setTimeout(() => {
    process.exit(process.exitCode || 0);
  }, FORCE_EXIT_TIMEOUT_MS).unref();
};

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
  checkNodeVersion();
  let mainError: unknown;
  try {
    await main();
  } catch (error) {
    mainError = error;
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
