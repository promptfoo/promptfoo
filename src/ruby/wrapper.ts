import fs from 'fs';
import os from 'os';
import path from 'path';

import logger from '../logger';
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
  const tempFilePath = path.join(
    os.tmpdir(),
    `temp-ruby-code-${Date.now()}-${Math.random().toString(16).slice(2)}.rb`,
  );
  try {
    fs.writeFileSync(tempFilePath, code);
    // Necessary to await so temp file doesn't get deleted.
    const result = await runRuby<T>(tempFilePath, method, args);
    return result;
  } catch (error) {
    logger.error(`Error executing Ruby code: ${error}`);
    throw error;
  } finally {
    try {
      fs.unlinkSync(tempFilePath);
    } catch (error) {
      logger.error(`Error removing temporary file: ${error}`);
    }
  }
}
