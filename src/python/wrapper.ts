import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';

import { PythonShell, Options as PythonShellOptions } from 'python-shell';

import logger from '../logger';
import { safeJsonStringify } from '../util';

/**
 * Runs a Python script using the provided list of arguments.
 * @param {string} scriptPath - The path to the Python script to run.
 * @param {string} method - The method name to call in the Python script.
 * @param {(string | object)[]} args - The list of arguments to pass to the Python method.
 * @returns {Promise<any>} - The result from the Python script.
 */
export async function runPython(
  scriptPath: string,
  method: string,
  args: (string | object | undefined)[],
  options: { pythonExecutable?: string } = {},
): Promise<any> {
  const absPath = path.resolve(scriptPath);
  const tempJsonPath = path.join(
    os.tmpdir(),
    `promptfoo-python-input-json-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const pythonOptions: PythonShellOptions = {
    mode: 'text',
    pythonPath: options.pythonExecutable || process.env.PROMPTFOO_PYTHON || 'python',
    scriptPath: __dirname,
    args: [absPath, method, tempJsonPath],
  };

  try {
    await fs.writeFile(tempJsonPath, safeJsonStringify(args));
    const results = await PythonShell.run('wrapper.py', pythonOptions);
    logger.debug(`Python script ${absPath} returned: ${results.join('\n')}`);
    let result: { type: 'final_result'; data: any } | undefined;
    try {
      result = JSON.parse(results[results.length - 1]);
    } catch (error) {
      throw new Error(
        `Invalid JSON: ${(error as Error).message} when parsing result: ${
          results[results.length - 1]
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
    await fs
      .unlink(tempJsonPath)
      .catch((error) => logger.error(`Error removing temporary file: ${error}`));
  }
}

/**
 * Executes Python code by writing it to a temporary file
 * @param {string} code - The Python code to execute.
 * @param {string} method - The method name to call in the Python script.
 * @param {(string | object | undefined)[]} args - The list of arguments to pass to the Python method.
 * @returns {Promise<any>} - The result from executing the Python code.
 */
export async function runPythonCode(
  code: string,
  method: string,
  args: (string | object | undefined)[],
): Promise<any> {
  const tempFilePath = path.join(
    os.tmpdir(),
    `temp-python-code-${Date.now()}-${Math.random().toString(16).slice(2)}.py`,
  );
  try {
    await fs.writeFile(tempFilePath, code);
    // Necessary to await so temp file doesn't get deleted.
    const result = await runPython(tempFilePath, method, args);
    return result;
  } catch (error) {
    logger.error(`Error executing Python code: ${error}`);
    throw error;
  } finally {
    await fs
      .unlink(tempFilePath)
      .catch((error) => logger.error(`Error removing temporary file: ${error}`));
  }
}
