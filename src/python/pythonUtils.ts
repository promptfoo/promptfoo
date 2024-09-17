import { exec } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import type { Options as PythonShellOptions } from 'python-shell';
import { PythonShell } from 'python-shell';
import util from 'util';
import { getEnvString } from '../envars';
import logger from '../logger';
import { safeJsonStringify } from '../util/json';

const execAsync = util.promisify(exec);

export const state: { cachedPythonPath: string | null } = { cachedPythonPath: null };

/**
 * Validates and caches the Python executable path.
 *
 * @param pythonPath - Path to the Python executable.
 * @param isExplicit - If true, only tries the provided path.
 * @returns Validated Python executable path.
 * @throws {Error} If no valid Python executable is found.
 */
export async function validatePythonPath(pythonPath: string, isExplicit: boolean): Promise<string> {
  if (state.cachedPythonPath) {
    return state.cachedPythonPath;
  }

  const isWindows = process.platform === 'win32';
  const command = isWindows ? 'where' : 'which';
  const alternativePath = isWindows ? 'py -3' : 'python3';

  async function tryPath(path: string): Promise<string | null> {
    try {
      const result = await Promise.race([
        execAsync(`${command} ${path}`),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Command timed out')), 250),
        ),
      ]);
      return (result as { stdout: string }).stdout.trim();
    } catch {
      return null;
    }
  }
  const primaryPath = await tryPath(pythonPath);
  if (primaryPath) {
    state.cachedPythonPath = primaryPath;
    return primaryPath;
  }
  if (isExplicit) {
    throw new Error(
      `Python not found. Tried "${pythonPath}" ` +
        `Please ensure Python is installed and set the PROMPTFOO_PYTHON environment variable ` +
        `to your Python executable path (e.g., '${isWindows ? 'C:\\Python39\\python.exe' : '/usr/bin/python3'}').`,
    );
  }
  const secondaryPath = await tryPath(alternativePath);
  if (secondaryPath) {
    state.cachedPythonPath = secondaryPath;
    return secondaryPath;
  }
  throw new Error(
    `Python not found. Tried "${pythonPath}" and "${alternativePath}". ` +
      `Please ensure Python 3 is installed and set the PROMPTFOO_PYTHON environment variable ` +
      `to your Python 3 executable path (e.g., '${isWindows ? 'C:\\Python39\\python.exe' : '/usr/bin/python3'}').`,
  );
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
  args: (string | object | undefined)[],
  options: { pythonExecutable?: string } = {},
): Promise<string | object> {
  const absPath = path.resolve(scriptPath);
  const tempJsonPath = path.join(
    os.tmpdir(),
    `promptfoo-python-input-json-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const outputPath = path.join(
    os.tmpdir(),
    `promptfoo-python-output-json-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const pythonPath = options.pythonExecutable || getEnvString('PROMPTFOO_PYTHON') || 'python';

  await validatePythonPath(
    pythonPath,
    typeof (options.pythonExecutable || getEnvString('PROMPTFOO_PYTHON')) === 'string',
  );

  const pythonOptions: PythonShellOptions = {
    mode: 'text',
    pythonPath,
    scriptPath: __dirname,
    args: [absPath, method, tempJsonPath, outputPath],
  };

  try {
    await fs.writeFile(tempJsonPath, safeJsonStringify(args), 'utf-8');
    logger.debug(`Running Python wrapper with args: ${safeJsonStringify(args)}`);
    await PythonShell.run('wrapper.py', pythonOptions);
    const output = await fs.readFile(outputPath, 'utf-8');
    logger.debug(`Python script ${absPath} returned: ${output}`);
    let result: { type: 'final_result'; data: any } | undefined;
    try {
      result = JSON.parse(output);
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
    await Promise.all(
      [tempJsonPath, outputPath].map((file) =>
        fs.unlink(file).catch((error) => logger.error(`Error removing ${file}: ${error}`)),
      ),
    );
  }
}
