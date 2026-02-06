import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Command } from 'commander';
import { getGlobalDispatcher } from 'undici';
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
import { generateTestsCommand } from './commands/generate/tests';
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
import telemetry from './telemetry';
import { checkForUpdates } from './updates';
import { loadDefaultConfig } from './util/config/default';
import { printErrorInformation } from './util/errors/index';
import { setupEnv } from './util/index';
import { VERSION } from './version';

/**
 * Normalize env paths from CLI input.
 * Handles: single string, array of strings, comma-separated strings.
 * @returns Single string (if one path) or array of strings (if multiple)
 */
function normalizeEnvPaths(input: string | string[] | undefined): string | string[] | undefined {
  if (!input) {
    return undefined;
  }
  // Commander with variadic option gives us an array
  const rawPaths = Array.isArray(input) ? input : [input];

  // Expand comma-separated values and flatten
  const expanded = rawPaths
    .flatMap((p) => (p.includes(',') ? p.split(',').map((s) => s.trim()) : p.trim()))
    .filter((p) => p.length > 0);

  if (expanded.length === 0) {
    return undefined;
  }

  // Return single string if only one path (backward compat for logging)
  return expanded.length === 1 ? expanded[0] : expanded;
}

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
 * Gets the full command path by traversing the parent chain.
 * e.g., "auth teams list" instead of just "list"
 */
function getCommandPath(command: Command): string {
  const parts: string[] = [];
  let current: Command | null = command;

  while (current) {
    const name = current.name();
    // Skip the root 'promptfoo' command
    if (name && name !== 'promptfoo') {
      parts.unshift(name);
    }
    current = current.parent as Command | null;
  }

  return parts.join(' ');
}

/**
 * Adds verbose and env-file options to all commands recursively,
 * and automatically records telemetry for all command invocations.
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
    // Variadic option: supports --env-file a --env-file b or --env-file a,b
    command.option(
      '--env-file, --env-path <paths...>',
      'Path(s) to .env file(s). Can specify multiple files or use comma-separated values.',
    );
  }

  command.hook('preAction', (thisCommand) => {
    if (thisCommand.opts().verbose) {
      setLogLevel('debug');
      logger.debug('Verbose mode enabled via --verbose flag');
    }

    const rawEnvPath = thisCommand.opts().envFile || thisCommand.opts().envPath;
    const envPath = normalizeEnvPaths(rawEnvPath);
    if (envPath) {
      setupEnv(envPath);
      const pathsStr = Array.isArray(envPath) ? envPath.join(', ') : envPath;
      logger.debug(`Loading environment from ${pathsStr}`);
    }

    // Automatically record telemetry for all commands
    const commandName = getCommandPath(thisCommand);
    if (commandName) {
      telemetry.record('command_used', { name: commandName });
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

  await checkForUpdates();
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
  logsCommand(program);
  modelScanCommand(program);
  setupRetryCommand(program);
  validateCommand(program, defaultConfig, defaultConfigPath);
  void showCommand(program);

  generateDatasetCommand(generateCommand, defaultConfig, defaultConfigPath);
  generateAssertionsCommand(generateCommand, defaultConfig, defaultConfigPath);
  generateTestsCommand(generateCommand, defaultConfig, defaultConfigPath);
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

/**
 * Gracefully shuts down all resources with a hard timeout guarantee.
 * If cleanup operations hang, the process will force exit after the timeout.
 */
export const shutdownGracefully = async (): Promise<void> => {
  // CRITICAL: Set up the force-exit timeout FIRST, before any async operations.
  // This guarantees the process will exit even if any cleanup operation hangs.
  // The timeout uses .unref() so if everything cleans up naturally, Node can exit sooner.
  const FORCE_EXIT_TIMEOUT_MS = 3000; // 3 seconds max for all cleanup
  const forceExitTimeout = setTimeout(() => {
    // Use console.error since logger might be the thing that's hanging
    // eslint-disable-next-line no-console
    console.error('Force exiting after shutdown timeout');
    process.exit(process.exitCode || 0);
  }, FORCE_EXIT_TIMEOUT_MS);
  forceExitTimeout.unref();

  logger.debug('Shutting down gracefully...');

  // Use Promise.race to add individual timeouts to cleanup operations
  const CLEANUP_OP_TIMEOUT_MS = 1000; // 1 second per operation max

  const withTimeout = async <T>(promise: Promise<T>, name: string): Promise<T | undefined> => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<undefined>((resolve) => {
      timeoutId = setTimeout(() => {
        // Use console.warn since logger might be closed or the thing that's hanging
        // eslint-disable-next-line no-console
        console.warn(`${name} timed out during shutdown`);
        resolve(undefined);
      }, CLEANUP_OP_TIMEOUT_MS);
      timeoutId.unref();
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  };

  try {
    await withTimeout(telemetry.shutdown(), 'telemetry.shutdown()');
  } catch (error) {
    logger.debug('[shutdownGracefully] Telemetry shutdown failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  logger.debug('Closing logger file transports');

  try {
    await withTimeout(closeLogger(), 'closeLogger()');
  } catch {
    // Can't log since logger might be closed
  }

  closeDbIfOpen();

  try {
    const dispatcher = getGlobalDispatcher();
    await withTimeout(dispatcher.destroy(), 'dispatcher.destroy()');
  } catch {
    // Silently handle dispatcher destroy errors
  }

  // Clear the force exit timeout if we got here - cleanup completed normally
  clearTimeout(forceExitTimeout);

  // Give Node.js a moment to naturally exit if all handles are closed
  // Using .unref() allows natural exit if everything cleans up properly
  const NATURAL_EXIT_TIMEOUT_MS = 100;
  setTimeout(() => {
    process.exit(process.exitCode || 0);
  }, NATURAL_EXIT_TIMEOUT_MS).unref();
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
