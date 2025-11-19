import fs from 'fs';
import os from 'os';
import path from 'path';

import { PythonShell } from 'python-shell';
import { getEnvBool, getEnvString } from '../envars';
import logger from '../logger';
import { safeJsonStringify } from '../util/json';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
import type { Options as PythonShellOptions } from 'python-shell';

/**
 * Gets an integer value from an environment variable.
 * @param key - The environment variable name
 * @returns The parsed integer value, or undefined if not set or not a valid integer
 */
export function getEnvInt(key: string): number | undefined {
  const value = process.env[key];
  if (value === undefined) {
    return undefined;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? undefined : parsed;
}

export const state: {
  cachedPythonPath: string | null;
  validationPromise: Promise<string> | null;
} = {
  cachedPythonPath: null,
  validationPromise: null,
};

/**
 * Try to find Python using Windows 'where' command, filtering out Microsoft Store stubs.
 */
async function tryWindowsWhere(): Promise<string | null> {
  try {
    const result = await execFileAsync('where', ['python']);
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
      const result = await execFileAsync(cmd, ['-c', 'import sys; print(sys.executable)']);
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
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Command timed out')), 2500);
    });

    const result = await Promise.race([execFileAsync(path, ['--version']), timeoutPromise]);

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    const versionOutput = (result as { stdout: string }).stdout.trim();
    if (versionOutput.startsWith('Python')) {
      return path;
    }
    return null;
  } catch {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    return null;
  }
}

/**
 * Validates and caches the Python executable path.
 *
 * @param pythonPath - Path to the Python executable.
 * @param isExplicit - If true, only tries the provided path.
 * @returns Validated Python executable path.
 * @throws {Error} If no valid Python executable is found.
 */
export async function validatePythonPath(pythonPath: string, isExplicit: boolean): Promise<string> {
  // Return cached result if available
  if (state.cachedPythonPath) {
    return state.cachedPythonPath;
  }

  // Create validation promise atomically if it doesn't exist
  // This prevents race conditions where multiple calls create separate validations
  if (!state.validationPromise) {
    state.validationPromise = (async () => {
      try {
        const primaryPath = await tryPath(pythonPath);
        if (primaryPath) {
          state.cachedPythonPath = primaryPath;
          state.validationPromise = null;
          return primaryPath;
        }

        if (isExplicit) {
          const error = new Error(
            `Python 3 not found. Tried "${pythonPath}" ` +
              `Please ensure Python 3 is installed and set the PROMPTFOO_PYTHON environment variable ` +
              `to your Python 3 executable path (e.g., '${process.platform === 'win32' ? 'C:\\Python39\\python.exe' : '/usr/bin/python3'}').`,
          );
          // Clear promise on error to allow retry
          state.validationPromise = null;
          throw error;
        }

        // Try to get Python executable using comprehensive detection
        const detectedPath = await getSysExecutable();
        if (detectedPath) {
          state.cachedPythonPath = detectedPath;
          state.validationPromise = null;
          return detectedPath;
        }

        const error = new Error(
          `Python 3 not found. Tried "${pythonPath}", sys.executable detection, and fallback commands. ` +
            `Please ensure Python 3 is installed and set the PROMPTFOO_PYTHON environment variable ` +
            `to your Python 3 executable path (e.g., '${process.platform === 'win32' ? 'C:\\Python39\\python.exe' : '/usr/bin/python3'}').`,
        );
        // Clear promise on error to allow retry
        state.validationPromise = null;
        throw error;
      } catch (error) {
        // Ensure promise is cleared on any error
        state.validationPromise = null;
        throw error;
      }
    })();
  }

  // Return the existing or newly-created promise
  return state.validationPromise;
}

/**
 * Runs a Python script with the specified method and arguments.
 *
 * @param scriptPath - The path to the Python script to run.
 * @param method - The name of the method to call in the Python script.
 * @param args - An array of arguments to pass to the Python script.
 * @param options - Optional settings for running the Python script.
 * @param options.pythonExecutable - Optional path to the Python executable.
 * @returns A promise that resolves to the output of the Python script.
 * @throws An error if there's an issue running the Python script or parsing its output.
 */
export async function runPython(
  scriptPath: string,
  method: string,
  args: (string | number | object | undefined)[],
  options: { pythonExecutable?: string } = {},
): Promise<any> {
  const absPath = path.resolve(scriptPath);
  const tempJsonPath = path.join(
    os.tmpdir(),
    `promptfoo-python-input-json-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const outputPath = path.join(
    os.tmpdir(),
    `promptfoo-python-output-json-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const customPath = options.pythonExecutable || getEnvString('PROMPTFOO_PYTHON');
  let pythonPath = customPath || 'python';

  pythonPath = await validatePythonPath(pythonPath, typeof customPath === 'string');

  const pythonOptions: PythonShellOptions = {
    args: [absPath, method, tempJsonPath, outputPath],
    env: process.env,
    mode: 'binary',
    pythonPath,
    scriptPath: __dirname,
    // When `inherit` is used, `import pdb; pdb.set_trace()` will work.
    ...(getEnvBool('PROMPTFOO_PYTHON_DEBUG_ENABLED') && { stdio: 'inherit' }),
  };

  try {
    fs.writeFileSync(tempJsonPath, safeJsonStringify(args) as string, 'utf-8');
    logger.debug(`Running Python wrapper with args: ${safeJsonStringify(args)}`);

    await new Promise<void>((resolve, reject) => {
      try {
        const pyshell = new PythonShell('wrapper.py', pythonOptions);

        pyshell.stdout?.on('data', (chunk: Buffer) => {
          logger.debug(chunk.toString('utf-8').trim());
        });

        pyshell.stderr?.on('data', (chunk: Buffer) => {
          logger.error(chunk.toString('utf-8').trim());
        });

        pyshell.end((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } catch (error) {
        reject(error);
      }
    });

    const output = fs.readFileSync(outputPath, 'utf-8');
    logger.debug(`Python script ${absPath} returned: ${output}`);

    let result: { type: 'final_result'; data: any } | undefined;
    try {
      result = JSON.parse(output);
      logger.debug(
        `Python script ${absPath} parsed output type: ${typeof result}, structure: ${result ? JSON.stringify(Object.keys(result)) : 'undefined'}`,
      );
    } catch (error) {
      throw new Error(
        `Invalid JSON: ${(error as Error).message} when parsing result: ${
          output
        }\nStack Trace: ${(error as Error).stack}`,
      );
    }
    if (result?.type !== 'final_result') {
      throw new Error('The Python script `call_api` function must return a dict with an `output`');
    }

    return result.data;
  } catch (error) {
    logger.error(
      `Error running Python script: ${(error as Error).message}\nStack Trace: ${
        (error as Error).stack?.replace('--- Python Traceback ---', 'Python Traceback: ') ||
        'No Python traceback available'
      }`,
    );
    throw new Error(
      `Error running Python script: ${(error as Error).message}\nStack Trace: ${
        (error as Error).stack?.replace('--- Python Traceback ---', 'Python Traceback: ') ||
        'No Python traceback available'
      }`,
    );
  } finally {
    [tempJsonPath, outputPath].forEach((file) => {
      try {
        fs.unlinkSync(file);
      } catch (error) {
        logger.error(`Error removing ${file}: ${error}`);
      }
    });
  }
}

/**
 * Synchronously runs a Python function and returns its result.
 * Used for loading tool definitions from Python files.
 *
 * @param scriptPath - The path to the Python script.
 * @param functionName - The name of the function to call.
 * @param options - Optional settings.
 * @param options.pythonExecutable - Optional path to the Python executable.
 * @returns The result of the Python function (must return JSON-serializable data).
 * @throws An error if Python execution fails or the function doesn't exist.
 */
export function runPythonSync(
  scriptPath: string,
  functionName: string,
  options: { pythonExecutable?: string } = {},
): any {
  const { spawnSync } = require('child_process');
  const absPath = path.resolve(scriptPath);
  const dirName = path.dirname(absPath);
  const moduleName = path.basename(absPath, '.py');

  // Build Python code that imports the module and calls the function
  const pythonCode = `
import json
import sys
sys.path.insert(0, ${JSON.stringify(dirName)})
from ${moduleName} import ${functionName}
result = ${functionName}()
print(json.dumps(result))
`.trim();

  // Determine Python executable - try custom path first, then env var, then defaults
  const customPath = options.pythonExecutable || getEnvString('PROMPTFOO_PYTHON');

  // List of Python commands to try
  const pythonCommands = customPath
    ? [customPath]
    : process.platform === 'win32'
      ? ['python', 'python3', 'py']
      : ['python3', 'python'];

  let lastError: Error | null = null;

  for (const pythonCmd of pythonCommands) {
    try {
      const result = spawnSync(pythonCmd, ['-c', pythonCode], {
        encoding: 'utf-8',
        timeout: 30000,
        cwd: dirName,
        env: process.env,
      });

      if (result.error) {
        // Command not found or other spawn error
        lastError = result.error;
        continue;
      }

      if (result.status !== 0) {
        // Python execution error
        const stderr = result.stderr?.trim() || 'Unknown error';
        lastError = new Error(stderr);
        continue;
      }

      const output = result.stdout?.trim();
      if (!output) {
        throw new Error(`Python function "${functionName}" in ${scriptPath} returned no output`);
      }

      try {
        return JSON.parse(output);
      } catch {
        throw new Error(
          `Failed to parse JSON output from Python function "${functionName}" in ${scriptPath}: ${output}`,
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('Failed to parse JSON')) {
        throw err; // Re-throw parse errors immediately
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  // All Python commands failed
  const errorMessage = lastError?.message || 'Unknown error';
  throw new Error(
    `Failed to execute Python function "${functionName}" in ${scriptPath}:\n${errorMessage}\n\n` +
      `Make sure:\n` +
      `1. Python 3 is installed and available in PATH\n` +
      `2. The function "${functionName}" exists in ${scriptPath}\n` +
      `3. The function returns a JSON-serializable value (list or dict)`,
  );
}
