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

let cachedPythonPath: string | null = null;

/**
 * Validates the given Python path and caches the result.
 *
 * @param pythonPath - The path to the Python executable to validate.
 * @returns A promise that resolves to the validated Python path.
 * @throws An error if the Python path is invalid.
 */
export async function validatePythonPath(pythonPath: string): Promise<string> {
  if (cachedPythonPath) {
    return cachedPythonPath;
  }

  const command = process.platform === 'win32' ? 'where' : 'which';
  try {
    const { stdout } = await execAsync(`${command} ${pythonPath}`);
    cachedPythonPath = stdout.trim();
    return cachedPythonPath;
  } catch (error) {
    throw new Error(`Invalid Python path: ${pythonPath}`);
  }
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

  const pythonOptions: PythonShellOptions = {
    mode: 'binary',
    pythonPath,
    scriptPath: __dirname,
    args: [absPath, method, tempJsonPath, outputPath],
  };

  try {
    await validatePythonPath(pythonPath);
  } catch (error) {
    logger.error(`Error validating Python path: ${(error as Error).message}`);
    throw error;
  }
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
