import { PythonShell, Options as PythonShellOptions } from 'python-shell';
import path from 'path';

import logger from '../logger';

/**
 * Runs a Python script using the provided list of arguments.
 * @param {string} scriptPath - The path to the Python script to run.
 * @param {string} method - The method name to call in the Python script.
 * @param {string[]} args - The list of arguments to pass to the Python method.
 * @returns {Promise<string[]>} - The result from the Python script.
 */
export async function runPython(scriptPath: string, method: string, args: string[]): Promise<any> {
  const absPath = path.resolve(scriptPath);
  const pythonOptions: PythonShellOptions = {
    mode: 'text',
    pythonPath: process.env.PROMPTFOO_PYTHON || 'python',
    scriptPath: __dirname,
    args: [absPath, method, ...args.map((arg) => JSON.stringify(arg))],
  };

  try {
    const relativePathToWrapper = path.relative(__dirname, path.join(__dirname, 'wrapper.py'));
    const results = await PythonShell.run(relativePathToWrapper, pythonOptions);
    logger.debug(`Python script ${absPath} returned: ${results.join('\n')}`);
    const result: { type: 'final_result'; data: any} = JSON.parse(results[results.length - 1]);
    if (result?.type !== 'final_result') {
      throw new Error(
        'The Python script `call_api` function must return a dict with an `output` or `error` string',
      );
    }
    return result.data;
  } catch (error) {
    console.error(`Error running Python script: ${error}`);
    throw error;
  }
}
