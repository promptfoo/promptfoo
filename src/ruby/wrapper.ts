import logger from '../logger';
import {
  createSecureTempDirectory,
  removeSecureTempDirectory,
  writeSecureTempFile,
} from '../util/secureTempFiles';
import { runRuby } from './rubyUtils';

/**
 * Executes Ruby code by writing it to a temporary file
 * @param {string} code - The Ruby code to execute.
 * @param {string} method - The method name to call in the Ruby script.
 * @param {(string | object | undefined)[]} args - The list of arguments to pass to the Ruby method.
 * @returns {Promise<string>} - The result from executing the Ruby code.
 */
export async function runRubyCode<T = unknown>(
  code: string,
  method: string,
  args: (string | object | undefined)[],
): Promise<T> {
  let tempDirectory: string | undefined;
  try {
    tempDirectory = await createSecureTempDirectory('promptfoo-ruby-code-');
    const tempFilePath = await writeSecureTempFile(tempDirectory, 'script.rb', code);
    // Necessary to await so temp file doesn't get deleted.
    const result = await runRuby<T>(tempFilePath, method, args);
    return result;
  } catch (error) {
    logger.error(`Error executing Ruby code: ${error}`);
    throw error;
  } finally {
    if (tempDirectory) {
      try {
        await removeSecureTempDirectory(tempDirectory);
      } catch (error) {
        logger.error(`Error removing temporary Ruby code directory: ${error}`);
      }
    }
  }
}
