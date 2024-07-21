import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { PythonShell, Options as PythonShellOptions } from 'python-shell';
import logger from '../logger';
import { safeJsonStringify } from '../util/json';

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
  const pythonOptions: PythonShellOptions = {
    mode: 'text',
    pythonPath: options.pythonExecutable || process.env.PROMPTFOO_PYTHON || 'python',
    scriptPath: __dirname,
    args: [absPath, method, tempJsonPath],
  };

  try {
    await fs.writeFile(tempJsonPath, safeJsonStringify(args));
    logger.debug(`Running Python wrapper with args: ${safeJsonStringify(args)}`);
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
