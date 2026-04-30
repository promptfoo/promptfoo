import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getGlobalDispatcher } from 'undici';
import { closeDbIfOpen } from './database/index';
import logger, { closeLogger, setLogLevel } from './logger';
import telemetry from './telemetry';
import { clearAgentCache } from './util/fetch/index';
import { setupEnv } from './util/index';
import type { Command } from 'commander';

// Tracks the last env path loaded to prevent double-loading.
// setupEnvFilesFromArgv() runs early (before Commander parses) with shouldLog=false,
// then the preAction hook may call loadEnvPathOnce again with shouldLog=true.
// If the paths match, the second call is a no-op (including its log), which is intentional:
// the env vars are already in process.env, and logging before Commander sets --verbose
// would be invisible anyway.
let loadedEnvPathKey: string | undefined;

function normalizeEnvPaths(input: string | string[] | undefined): string | string[] | undefined {
  if (!input) {
    return undefined;
  }

  const rawPaths = Array.isArray(input) ? input : [input];
  const expanded = rawPaths
    .flatMap((path) =>
      path.includes(',') ? path.split(',').map((value) => value.trim()) : path.trim(),
    )
    .filter((path) => path.length > 0);

  if (expanded.length === 0) {
    return undefined;
  }

  return expanded.length === 1 ? expanded[0] : expanded;
}

function getEnvPathKey(envPath: string | string[]): string {
  return Array.isArray(envPath) ? envPath.join('\0') : envPath;
}

function loadEnvPathOnce(envPath: string | string[], shouldLog: boolean): void {
  const envPathKey = getEnvPathKey(envPath);
  if (loadedEnvPathKey === envPathKey) {
    return;
  }

  setupEnv(envPath);
  loadedEnvPathKey = envPathKey;

  if (shouldLog) {
    const pathsStr = Array.isArray(envPath) ? envPath.join(', ') : envPath;
    logger.debug(`Loading environment from ${pathsStr}`);
  }
}

export function setupEnvFilesFromArgv(argv: string[] = process.argv.slice(2)): void {
  const envFileValues: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      break;
    }

    const envAssignment = arg.match(/^--env-(?:file|path)=(.*)$/);
    if (envAssignment) {
      envFileValues.push(envAssignment[1]);
      continue;
    }

    if (arg !== '--env-file' && arg !== '--env-path') {
      continue;
    }

    const nextArg = argv[i + 1];
    if (!nextArg || nextArg === '--' || nextArg.startsWith('-')) {
      continue;
    }

    envFileValues.push(nextArg);
    i += 1;
  }

  const envPath = normalizeEnvPaths(envFileValues);
  if (envPath) {
    loadEnvPathOnce(envPath, false);
  }
}

export function isMainModule(importMetaUrl: string, processArgv1: string | undefined): boolean {
  if (!processArgv1) {
    return false;
  }

  try {
    const currentModulePath = realpathSync(fileURLToPath(importMetaUrl));
    const mainModulePath = realpathSync(resolve(processArgv1));
    return currentModulePath === mainModulePath;
  } catch {
    return false;
  }
}

function getCommandPath(command: Command): string {
  const parts: string[] = [];
  let current: Command | null = command;

  while (current) {
    const name = current.name();
    if (name && name !== 'promptfoo') {
      parts.unshift(name);
    }
    current = current.parent as Command | null;
  }

  return parts.join(' ');
}

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
    command.option(
      '--env-file, --env-path <path>',
      'Path(s) to .env file(s). Repeat the flag or use comma-separated values for multiple files.',
      (value: string, previous: string[]) => [...previous, value],
      [],
    );
  }

  command.hook('preAction', (thisCommand, actionCommand) => {
    if (thisCommand.opts().verbose) {
      setLogLevel('debug');
      logger.debug('Verbose mode enabled via --verbose flag');
    }

    const rawEnvPath = thisCommand.opts().envFile || thisCommand.opts().envPath;
    const envPath = normalizeEnvPaths(rawEnvPath);
    if (envPath) {
      loadEnvPathOnce(envPath, true);
    }

    if (thisCommand === actionCommand) {
      const commandName = getCommandPath(actionCommand);
      if (commandName) {
        telemetry.record('command_used', { name: commandName });
      }
    }
  });

  command.commands.forEach((subCommand) => {
    addCommonOptionsRecursively(subCommand);
  });
}

export const shutdownGracefully = async (): Promise<void> => {
  const FORCE_EXIT_TIMEOUT_MS = 3000;
  const forceExitTimeout = setTimeout(() => {
    // eslint-disable-next-line no-console
    console.error('Force exiting after shutdown timeout');
    process.exit(process.exitCode || 0);
  }, FORCE_EXIT_TIMEOUT_MS);
  forceExitTimeout.unref();

  logger.debug('Shutting down gracefully...');

  const CLEANUP_OP_TIMEOUT_MS = 1000;

  const withTimeout = async <T>(promise: Promise<T>, name: string): Promise<T | undefined> => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<undefined>((resolveTimeout) => {
      timeoutId = setTimeout(() => {
        // eslint-disable-next-line no-console
        console.warn(`${name} timed out during shutdown`);
        resolveTimeout(undefined);
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
    // Can't log since logger might be closed.
  }

  closeDbIfOpen();
  clearAgentCache();

  try {
    const dispatcher = getGlobalDispatcher();
    await withTimeout(dispatcher.destroy(), 'dispatcher.destroy()');
  } catch {
    // Silently handle dispatcher destroy errors.
  }

  clearTimeout(forceExitTimeout);

  const NATURAL_EXIT_TIMEOUT_MS = 100;
  setTimeout(() => {
    process.exit(process.exitCode || 0);
  }, NATURAL_EXIT_TIMEOUT_MS).unref();
};
