import fs from 'fs';
import os from 'os';
import path from 'path';
import logger from '../logger';
import { runPython } from './pythonUtils';

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
    fs.writeFileSync(tempFilePath, code);
    // Necessary to await so temp file doesn't get deleted.
    const result = await runPython(tempFilePath, method, args);
    return result;
  } catch (error) {
    logger.error(`Error executing Python code: ${error}`);
    throw error;
  } finally {
    try {
      fs.unlinkSync(tempFilePath);
    } catch (error) {
      logger.error(`Error removing temporary file: ${error}`);
    }
  }
}
