import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

import cliState from '../cliState';
import { getEnvString, getProcessEnv } from '../envars';
import { getWrapperDir } from '../esm';
import logger from '../logger';
import { safeJsonStringify } from '../util/json';
import {
  createSecureTempDirectory,
  removeSecureTempDirectory,
  writeSecureTempFile,
} from '../util/secureTempFiles';

const execFileAsync = promisify(execFile);
const invocationValidations = new WeakMap<object, Map<string, Promise<string>>>();

function logStderr(stderr: string): void {
  for (const line of stderr.split(/\r?\n/)) {
    const message = line.trim();
    if (!message) {
      continue;
    }

    const levelMatch = /^(DEBUG|INFO|WARN|WARNING|ERROR|FATAL)\b[: ]?/i.exec(message);
    if (levelMatch) {
      switch (levelMatch[1].toUpperCase()) {
        case 'DEBUG':
          logger.debug(line);
          continue;
        case 'INFO':
          logger.info(line);
          continue;
        case 'WARN':
        case 'WARNING':
          logger.warn(line);
          continue;
        default:
          logger.error(line);
          continue;
      }
    }

    if (
      /\b(error|exception|fatal|failed|failure)\b/i.test(message) ||
      /(?:Error|Exception)\b/.test(message) ||
      /^from\s.+:\d+/.test(message)
    ) {
      logger.error(line);
    } else {
      logger.warn(line);
    }
  }
}

/**
 * Attempts to find Ruby using Windows 'where' command.
 * Only applicable on Windows platforms.
 * @returns The validated Ruby executable path, or null if not found
 */
async function tryWindowsWhere(): Promise<string | null> {
  try {
    const result = await execFileAsync('where', ['ruby'], { env: getProcessEnv() });
    const output = result.stdout.trim();

    // Handle empty output
    if (!output) {
      logger.debug("Windows 'where ruby' returned empty output");
      return null;
    }

    const paths = output.split('\n').filter((path) => path.trim());

    for (const rubyPath of paths) {
      const trimmedPath = rubyPath.trim();

      // Skip non-executables
      if (!trimmedPath.endsWith('.exe')) {
        continue;
      }

      const validated = await tryPath(trimmedPath);
      if (validated) {
        return validated;
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.debug(`Windows 'where ruby' failed: ${errorMsg}`);

    // Log permission/access errors differently
    if (errorMsg.includes('Access is denied') || errorMsg.includes('EACCES')) {
      logger.warn(`Permission denied when searching for Ruby: ${errorMsg}`);
    }
  }

  return null;
}

/**
 * Attempts to get Ruby executable path by running Ruby commands.
 * Uses RbConfig.ruby to get the actual Ruby executable path.
 * @param commands - Array of Ruby command names to try (e.g., ['ruby'])
 * @returns The Ruby executable path, or null if all commands fail
 */
async function tryRubyCommands(commands: string[]): Promise<string | null> {
  for (const cmd of commands) {
    try {
      const result = await execFileAsync(cmd, ['-e', 'puts RbConfig.ruby'], {
        env: getProcessEnv(),
      });
      const executablePath = result.stdout.trim();
      if (executablePath && executablePath !== 'None') {
        return executablePath;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.debug(`Ruby command "${cmd}" failed: ${errorMsg}`);

      // Log permission/access errors differently
      if (
        errorMsg.includes('Access is denied') ||
        errorMsg.includes('EACCES') ||
        errorMsg.includes('EPERM')
      ) {
        logger.warn(`Permission denied when trying Ruby command "${cmd}": ${errorMsg}`);
      }
    }
  }
  return null;
}

/**
 * Attempts to validate Ruby commands directly as a final fallback.
 * Validates each command by running it with --version.
 * @param commands - Array of Ruby command names to try (e.g., ['ruby'])
 * @returns The validated Ruby executable path, or null if all commands fail
 */
async function tryDirectCommands(commands: string[]): Promise<string | null> {
  for (const cmd of commands) {
    try {
      const validated = await tryPath(cmd);
      if (validated) {
        return validated;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.debug(`Direct command "${cmd}" failed: ${errorMsg}`);

      // Log permission/access errors differently
      if (
        errorMsg.includes('Access is denied') ||
        errorMsg.includes('EACCES') ||
        errorMsg.includes('EPERM')
      ) {
        logger.warn(`Permission denied when trying Ruby command "${cmd}": ${errorMsg}`);
      }
    }
  }
  return null;
}

/**
 * Attempts to get the Ruby executable path using platform-appropriate strategies.
 * @returns The Ruby executable path if successful, or null if failed.
 */
export async function getSysExecutable(): Promise<string | null> {
  if (process.platform === 'win32') {
    // Windows: Try 'where ruby' first
    const whereResult = await tryWindowsWhere();
    if (whereResult) {
      return whereResult;
    }

    // Then try ruby commands
    const sysResult = await tryRubyCommands(['ruby']);
    if (sysResult) {
      return sysResult;
    }

    // Final fallback to direct ruby command
    return await tryDirectCommands(['ruby']);
  } else {
    // Unix: Standard ruby detection
    return await tryRubyCommands(['ruby']);
  }
}

/**
 * Attempts to validate a Ruby executable path.
 * @param path - The path to the Ruby executable to test.
 * @returns The validated path if successful, or null if invalid.
 */
export async function tryPath(path: string): Promise<string | null> {
  try {
    const result = await execFileAsync(path, ['--version'], {
      env: getProcessEnv(),
      timeout: 2500,
      killSignal: 'SIGKILL',
    });
    return result.stdout.trim().toLowerCase().includes('ruby') ? path : null;
  } catch {
    return null;
  }
}

/** Share validation within an invocation; failed probes can be retried. */
export async function validateRubyPath(rubyPath: string, isExplicit: boolean): Promise<string> {
  const scope = cliState.envScope;
  if (!scope) {
    return validateExecutable(rubyPath, isExplicit);
  }

  let validations = invocationValidations.get(scope);
  if (!validations) {
    validations = new Map();
    invocationValidations.set(scope, validations);
  }
  const key = JSON.stringify([rubyPath, isExplicit]);
  let validation = validations.get(key);
  if (!validation) {
    validation = validateExecutable(rubyPath, isExplicit).catch((error) => {
      validations.delete(key);
      throw error;
    });
    validations.set(key, validation);
  }
  return validation;
}

async function validateExecutable(rubyPath: string, isExplicit: boolean): Promise<string> {
  const primaryPath = await tryPath(rubyPath);
  if (primaryPath) {
    return primaryPath;
  }

  const guidance =
    `Please ensure Ruby is installed and set the PROMPTFOO_RUBY environment variable ` +
    `to your Ruby executable path (e.g., '${process.platform === 'win32' ? 'C:\\Ruby32\\bin\\ruby.exe' : '/usr/bin/ruby'}').`;

  if (isExplicit) {
    throw new Error(`Ruby not found. Tried "${rubyPath}" ${guidance}`);
  }

  const detectedPath = await getSysExecutable();
  if (detectedPath) {
    return detectedPath;
  }

  throw new Error(
    `Ruby not found. Tried "${rubyPath}", ruby executable detection, and fallback commands. ${guidance}`,
  );
}

/**
 * Runs a Ruby script with the specified method and arguments.
 *
 * @param scriptPath - The path to the Ruby script to run.
 * @param method - The name of the method to call in the Ruby script.
 * @param args - An array of arguments to pass to the Ruby script.
 * @param options - Optional settings for running the Ruby script.
 * @param options.rubyExecutable - Optional path to the Ruby executable.
 * @returns A promise that resolves to the output of the Ruby script.
 * @throws An error if there's an issue running the Ruby script or parsing its output.
 */
export async function runRuby<T = unknown>(
  scriptPath: string,
  method: string,
  args: (string | number | object | undefined)[],
  options: { rubyExecutable?: string; abortSignal?: AbortSignal } = {},
): Promise<T> {
  options.abortSignal?.throwIfAborted();
  const absPath = path.resolve(scriptPath);
  const customPath = options.rubyExecutable || getEnvString('PROMPTFOO_RUBY');
  let rubyPath = customPath || 'ruby';
  let tempDirectory: string | undefined;

  rubyPath = await validateRubyPath(rubyPath, typeof customPath === 'string');
  options.abortSignal?.throwIfAborted();

  const wrapperPath = path.join(getWrapperDir('ruby'), 'wrapper.rb');

  try {
    tempDirectory = await createSecureTempDirectory('promptfoo-ruby-');
    const tempJsonPath = await writeSecureTempFile(
      tempDirectory,
      'input.json',
      safeJsonStringify(args) as string,
    );
    const outputPath = await writeSecureTempFile(tempDirectory, 'output.json', '');
    logger.debug('[Ruby] Running script', { scriptPath: absPath, method });

    options.abortSignal?.throwIfAborted();
    const execution = execFileAsync(
      rubyPath,
      [wrapperPath, absPath, method, tempJsonPath, outputPath],
      {
        env: getProcessEnv(),
        ...(options.abortSignal ? { signal: options.abortSignal } : {}),
      },
    );

    const closed =
      options.abortSignal && execution.child
        ? new Promise<void>((resolve) => execution.child.once('close', () => resolve()))
        : undefined;
    // execFile abort sends SIGTERM, which a provider may ignore.
    const { stdout, stderr } = await execution.finally(async () => {
      if (options.abortSignal?.aborted) {
        execution.child?.kill('SIGKILL');
      }
      // Keep the request files until the process exits.
      await closed;
    });
    options.abortSignal?.throwIfAborted();

    if (stdout) {
      logger.debug(stdout.trim());
    }

    if (stderr) {
      logStderr(stderr);
    }

    const output = await fs.readFile(outputPath, 'utf-8');
    logger.debug('[Ruby] Script returned a result', { scriptPath: absPath });

    let result: { type: 'final_result'; data: T } | undefined;
    try {
      result = JSON.parse(output);
    } catch (error) {
      throw new Error(
        `Invalid JSON returned by Ruby script: ${(error as Error).message}\nStack Trace: ${
          (error as Error).stack
        }`,
      );
    }
    if (result?.type !== 'final_result') {
      throw new Error('The Ruby script `call_api` function must return a hash with an `output`');
    }

    return result.data;
  } catch (error) {
    options.abortSignal?.throwIfAborted();
    logger.error(
      `Error running Ruby script: ${(error as Error).message}\nStack Trace: ${
        (error as Error).stack || 'No Ruby traceback available'
      }`,
    );
    throw new Error(
      `Error running Ruby script: ${(error as Error).message}\nStack Trace: ${
        (error as Error).stack || 'No Ruby traceback available'
      }`,
    );
  } finally {
    if (tempDirectory) {
      try {
        await removeSecureTempDirectory(tempDirectory);
      } catch (error) {
        logger.error(`Error removing temporary Ruby directory: ${error}`);
      }
    }
  }
}
