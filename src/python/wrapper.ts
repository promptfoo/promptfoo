import logger from '../logger';
import {
  createSecureTempDirectory,
  removeSecureTempDirectory,
  writeSecureTempFile,
} from '../util/secureTempFiles';
import { runPython } from './pythonUtils';

/**
 * Executes Python code by writing it to a temporary file
 * @param {string} code - The Python code to execute.
 * @param {string} method - The method name to call in the Python script.
 * @param {(string | object | undefined)[]} args - The list of arguments to pass to the Python method.
 * @returns {Promise<T>} - The result from executing the Python code.
 */
export async function runPythonCode<T = unknown>(
  code: string,
  method: string,
  args: (string | object | undefined)[],
): Promise<T> {
  let tempDirectory: string | undefined;
  try {
    tempDirectory = await createSecureTempDirectory('promptfoo-python-code-');
    const tempFilePath = await writeSecureTempFile(tempDirectory, 'script.py', code);
    // Necessary to await so temp file doesn't get deleted.
    const result = await runPython<T>(tempFilePath, method, args);
    return result;
  } catch (error) {
    logger.error(`Error executing Python code: ${error}`);
    throw error;
  } finally {
    if (tempDirectory) {
      try {
        await removeSecureTempDirectory(tempDirectory);
      } catch (error) {
        logger.error(`Error removing temporary Python code directory: ${error}`);
      }
    }
  }
}
