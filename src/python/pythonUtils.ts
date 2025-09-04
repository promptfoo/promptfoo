import fs from 'fs';
import os from 'os';
import path from 'path';

import { PythonShell } from 'python-shell';
import { getEnvBool, getEnvString } from '../envars';
import logger from '../logger';
import { safeJsonStringify } from '../util/json';
import { execAsync } from './execAsync';
import type { Options as PythonShellOptions } from 'python-shell';

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
    const result = await execAsync('where python');
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
      const result = await execAsync(`${cmd} -c "import sys; print(sys.executable)"`);
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

    const result = await Promise.race([execAsync(path + ' --version'), timeoutPromise]);

    // Clear the timeout to prevent open handle
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    const versionOutput = (result as { stdout: string }).stdout.trim();
    if (versionOutput.startsWith('Python')) {
      return path;
    }
    return null;
  } catch {
    // Clear the timeout to prevent open handle
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

  // If validation is already in progress, wait for it to complete
  if (state.validationPromise) {
    return state.validationPromise;
  }

  // Start new validation and store the promise to prevent concurrent validations
  const validationPromise = (async () => {
    try {
      const primaryPath = await tryPath(pythonPath);
      if (primaryPath) {
        state.cachedPythonPath = primaryPath;
        return primaryPath;
      }

      if (isExplicit) {
        throw new Error(
          `Python 3 not found. Tried "${pythonPath}" ` +
            `Please ensure Python 3 is installed and set the PROMPTFOO_PYTHON environment variable ` +
            `to your Python 3 executable path (e.g., '${process.platform === 'win32' ? 'C:\\Python39\\python.exe' : '/usr/bin/python3'}').`,
        );
      }

      // Try to get Python executable using comprehensive detection
      const detectedPath = await getSysExecutable();
      if (detectedPath) {
        state.cachedPythonPath = detectedPath;
        return detectedPath;
      }

      throw new Error(
        `Python 3 not found. Tried "${pythonPath}", sys.executable detection, and fallback commands. ` +
          `Please ensure Python 3 is installed and set the PROMPTFOO_PYTHON environment variable ` +
          `to your Python 3 executable path (e.g., '${process.platform === 'win32' ? 'C:\\Python39\\python.exe' : '/usr/bin/python3'}').`,
      );
    } finally {
      // Clear the promise when validation completes (success or failure)
      state.validationPromise = null;
    }
  })();

  state.validationPromise = validationPromise;
  return validationPromise;
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
