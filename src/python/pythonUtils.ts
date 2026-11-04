import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';

import { PythonShell } from 'python-shell';
import cliState from '../cliState';
import { getEnvBool, getEnvString, getProcessEnv } from '../envars';
import { getWrapperDir } from '../esm';
import logger from '../logger';
import { safeJsonStringify } from '../util/json';
import {
  createSecureTempDirectory,
  removeSecureTempDirectory,
  writeSecureTempFile,
} from '../util/secureTempFiles';
import { PythonStderrLogger } from './stderr';

const execFileAsync = promisify(execFile);
const oneShotValidations = new WeakMap<object, Map<string, Promise<string>>>();

import type { Options as PythonShellOptions } from 'python-shell';

/**
 * Prefer explicit config over the provider or active environment's Python path.
 * Leave an unset path undefined so validation can distinguish a required executable
 * from a system default that permits fallback detection.
 */
export function getConfiguredPythonPath(
  configPath?: string,
  envPath = getEnvString('PROMPTFOO_PYTHON'),
): string | undefined {
  return configPath || envPath || undefined;
}

/**
 * Try to find Python using Windows 'where' command, filtering out Microsoft Store stubs.
 */
async function tryWindowsWhere(): Promise<string | null> {
  try {
    const result = await execFileAsync('where', ['python'], { env: getProcessEnv() });
    const output = result.stdout.trim();

    // Handle empty output
    if (!output) {
      logger.debug("Windows 'where python' returned empty output");
      return null;
    }

    const paths = output.split('\n').filter((path) => path.trim());

    for (const pythonPath of paths) {
      const trimmedPath = pythonPath.trim();

      // Skip Microsoft Store stubs and non-executables
      if (trimmedPath.includes('WindowsApps') || !trimmedPath.endsWith('.exe')) {
        continue;
      }

      const validated = await tryPath(trimmedPath);
      if (validated) {
        return validated;
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.debug(`Windows 'where python' failed: ${errorMsg}`);

    // Log permission/access errors differently
    if (errorMsg.includes('Access is denied') || errorMsg.includes('EACCES')) {
      logger.warn(`Permission denied when searching for Python: ${errorMsg}`);
    }
  }

  return null;
}

/**
 * Try Python commands to get sys.executable path.
 */
async function tryPythonCommands(commands: string[]): Promise<string | null> {
  for (const cmd of commands) {
    try {
      const result = await execFileAsync(cmd, ['-c', 'import sys; print(sys.executable)'], {
        env: getProcessEnv(),
      });
      const executablePath = result.stdout.trim();
      if (executablePath && executablePath !== 'None') {
        // On Windows, ensure .exe suffix if missing (but only for Windows-style paths)
        if (process.platform === 'win32' && !executablePath.toLowerCase().endsWith('.exe')) {
          // Only add .exe for Windows-style paths (drive letter or UNC paths)
          if (executablePath.includes('\\') || /^[A-Za-z]:/.test(executablePath)) {
            return executablePath + '.exe';
          }
        }
        return executablePath;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.debug(`Python command "${cmd}" failed: ${errorMsg}`);

      // Log permission/access errors differently
      if (
        errorMsg.includes('Access is denied') ||
        errorMsg.includes('EACCES') ||
        errorMsg.includes('EPERM')
      ) {
        logger.warn(`Permission denied when trying Python command "${cmd}": ${errorMsg}`);
      }
    }
  }
  return null;
}

/**
 * Try direct command validation as final fallback.
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
        logger.warn(`Permission denied when trying Python command "${cmd}": ${errorMsg}`);
      }
    }
  }
  return null;
}

/**
 * Attempts to get the Python executable path using platform-appropriate strategies.
 * @returns The Python executable path if successful, or null if failed.
 */
export async function getSysExecutable(): Promise<string | null> {
  if (process.platform === 'win32') {
    // Windows: Try 'where python' first to avoid Microsoft Store stubs
    const whereResult = await tryWindowsWhere();
    if (whereResult) {
      return whereResult;
    }

    // Then try py launcher commands (removing python3 as it's uncommon on Windows)
    const sysResult = await tryPythonCommands(['py', 'py -3']);
    if (sysResult) {
      return sysResult;
    }

    // Final fallback to direct python command
    return await tryDirectCommands(['python']);
  } else {
    // Unix: Standard python3/python detection
    return await tryPythonCommands(['python3', 'python']);
  }
}

/**
 * Attempts to validate a Python executable path.
 * @param path - The path to the Python executable to test.
 * @returns The validated path if successful, or null if invalid.
 */
export async function tryPath(path: string): Promise<string | null> {
  try {
    const result = await execFileAsync(path, ['--version'], {
      env: getProcessEnv(),
      timeout: 2500,
      killSignal: 'SIGKILL',
    });
    return result.stdout.trim().startsWith('Python') ? path : null;
  } catch {
    return null;
  }
}

/** Validate on every call; use fallback detection only for a system default. */
export async function validatePythonPath(pythonPath: string, isExplicit: boolean): Promise<string> {
  const primaryPath = await tryPath(pythonPath);
  if (primaryPath) {
    return primaryPath;
  }

  const guidance =
    `Please ensure Python 3 is installed and set the PROMPTFOO_PYTHON environment variable ` +
    `to your Python 3 executable path (e.g., '${process.platform === 'win32' ? 'C:\\Python39\\python.exe' : '/usr/bin/python3'}').`;

  if (isExplicit) {
    throw new Error(`Python 3 not found. Tried "${pythonPath}" ${guidance}`);
  }

  const detectedPath = await getSysExecutable();
  if (detectedPath) {
    return detectedPath;
  }

  throw new Error(
    `Python 3 not found. Tried "${pythonPath}", sys.executable detection, and fallback commands. ${guidance}`,
  );
}

// One-shot calls share validation within an invocation; worker restarts revalidate directly.
function validateOneShotPythonPath(pythonPath: string, isExplicit: boolean): Promise<string> {
  const scope = cliState.envScope;
  if (!scope) {
    return validatePythonPath(pythonPath, isExplicit);
  }
  let validations = oneShotValidations.get(scope);
  if (!validations) {
    validations = new Map();
    oneShotValidations.set(scope, validations);
  }
  const key = JSON.stringify([pythonPath, isExplicit]);
  let validation = validations.get(key);
  if (!validation) {
    validation = validatePythonPath(pythonPath, isExplicit).catch((error) => {
      validations.delete(key);
      throw error;
    });
    validations.set(key, validation);
  }
  return validation;
}

/**
 * Runs a Python script with the specified method and arguments.
 *
 * @param scriptPath - The path to the Python script to run.
 * @param method - The name of the method to call in the Python script.
 * @param args - An array of arguments to pass to the Python script.
 * @param options - Optional settings for running the Python script.
 * @param options.pythonExecutable - Optional path to the Python executable.
 * @param options.abortSignal - Stops this invocation and waits for its child to close before cleanup.
 * @returns A promise that resolves to the output of the Python script.
 * @throws An error if there's an issue running the Python script or parsing its output.
 */
export async function runPython<T = unknown>(
  scriptPath: string,
  method: string,
  args: (string | number | object | undefined)[],
  options: { pythonExecutable?: string; abortSignal?: AbortSignal } = {},
): Promise<T> {
  options.abortSignal?.throwIfAborted();
  const absPath = path.resolve(scriptPath);
  const customPath = getConfiguredPythonPath(options.pythonExecutable);
  let pythonPath = customPath || 'python';
  let tempDirectory: string | undefined;

  pythonPath = await validateOneShotPythonPath(pythonPath, typeof customPath === 'string');
  options.abortSignal?.throwIfAborted();

  try {
    tempDirectory = await createSecureTempDirectory('promptfoo-python-');
    const tempJsonPath = await writeSecureTempFile(
      tempDirectory,
      'input.json',
      safeJsonStringify(args) as string,
    );
    const outputPath = await writeSecureTempFile(tempDirectory, 'output.json', '');
    const pythonOptions: PythonShellOptions = {
      args: [absPath, method, tempJsonPath, outputPath],
      env: getProcessEnv(),
      mode: 'binary',
      pythonPath,
      scriptPath: getWrapperDir('python'),
      // When `inherit` is used, `import pdb; pdb.set_trace()` will work.
      ...(getEnvBool('PROMPTFOO_PYTHON_DEBUG_ENABLED') && { stdio: 'inherit' }),
    };

    logger.debug('[Python] Running script', { scriptPath: absPath, method });

    await new Promise<void>((resolve, reject) => {
      options.abortSignal?.throwIfAborted();
      const pyshell = new PythonShell('wrapper.py', pythonOptions);
      const child = pyshell.childProcess;
      const signal = options.abortSignal;
      const stderrLogger = new PythonStderrLogger();
      let childClosed = false;
      let settled = false;
      let shellEnded = false;
      let shellFailed = false;
      let stopRequested = false;
      let killTimer: NodeJS.Timeout | undefined;
      let failure: { error: unknown } | undefined;
      let exitFailure: Error | undefined;

      // Preserve whichever independent failure or caller cancellation arrived first.
      const rememberFailure = (error: unknown) => {
        failure ??= { error };
      };
      const onStdout = (chunk: Buffer) => logger.debug(chunk.toString('utf-8').trim());
      const onStderr = (chunk: Buffer) => stderrLogger.handleData(chunk);
      const finish = () => {
        // SDK end/close and kill acceptance do not prove the child has closed.
        // Spawn failure can emit error/child close without an SDK end callback.
        if (settled || !childClosed || (!shellEnded && !shellFailed)) {
          return;
        }
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        clearTimeout(killTimer);
        child.removeListener('close', onClose);
        pyshell.removeListener('error', onError);
        pyshell.stdout?.removeListener('data', onStdout);
        pyshell.stderr?.removeListener('data', onStderr);
        stderrLogger.flush();
        if (failure) {
          reject(failure.error);
        } else if (exitFailure) {
          reject(exitFailure);
        } else {
          resolve();
        }
      };
      const onError = (error: Error) => {
        shellFailed = true;
        rememberFailure(error);
        finish();
      };
      const onClose = (code: number | null, exitSignal: NodeJS.Signals | null) => {
        childClosed = true;
        // Stop escalation and detach the caller as soon as the owned child closes.
        signal?.removeEventListener('abort', onAbort);
        clearTimeout(killTimer);
        if (exitSignal) {
          exitFailure = new Error(`Python process exited with signal ${exitSignal}`);
        } else if (code !== null && code !== 0) {
          exitFailure = new Error(`Python process exited with code ${code}`);
        }
        finish();
      };
      const stopChild = () => {
        if (childClosed || stopRequested) {
          return;
        }
        stopRequested = true;
        try {
          child.kill('SIGTERM');
        } catch (error) {
          rememberFailure(error);
        }
        if (!childClosed) {
          killTimer = setTimeout(() => {
            if (!childClosed) {
              try {
                child.kill('SIGKILL');
              } catch (error) {
                rememberFailure(error);
              }
            }
          }, 1000);
          killTimer.unref();
        }
      };
      const onAbort = () => {
        if (!childClosed) {
          rememberFailure(signal!.reason);
          stopChild();
        }
      };

      pyshell.on('error', onError);
      child.once('close', onClose);
      try {
        pyshell.stdout?.on('data', onStdout);
        pyshell.stderr?.on('data', onStderr);
        signal?.addEventListener('abort', onAbort, { once: true });
        pyshell.end((error) => {
          shellEnded = true;
          if (error) {
            rememberFailure(error);
          }
          finish();
        });
        // Covers cancellation between the initial check and listener attachment.
        if (signal?.aborted) {
          onAbort();
        }
      } catch (error) {
        shellFailed = true;
        rememberFailure(error);
        stopChild();
        finish();
      }
    });

    const output = await fs.readFile(outputPath, 'utf-8');
    logger.debug('[Python] Script returned a result', { scriptPath: absPath });

    let result: { type: 'final_result'; data: T } | undefined;
    try {
      result = JSON.parse(output);
    } catch (error) {
      throw new Error(
        `Invalid JSON returned by Python script: ${(error as Error).message}\nStack Trace: ${
          (error as Error).stack
        }`,
      );
    }
    if (result?.type !== 'final_result') {
      throw new Error('The Python script `call_api` function must return a dict with an `output`');
    }

    return result.data;
  } catch (error) {
    if (options.abortSignal?.aborted && error === options.abortSignal.reason) {
      throw error;
    }
    const message = `Error running Python script: ${(error as Error).message}\nStack Trace: ${
      (error as Error).stack?.replace('--- Python Traceback ---', 'Python Traceback: ') ||
      'No Python traceback available'
    }`;
    logger.error(message);
    throw new Error(message);
  } finally {
    if (tempDirectory) {
      try {
        await removeSecureTempDirectory(tempDirectory);
      } catch (error) {
        logger.error(`Error removing temporary Python directory: ${error}`);
      }
    }
  }
}
