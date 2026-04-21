import { exec } from 'child_process';
import util from 'util';

/**
 * Promisified version of Node.js `exec` function.
 *
 * This wrapper exists to make mocking easier in tests, as directly mocking
 * `util.promisify(exec)` can be problematic.
 */
export const execAsync = util.promisify(exec);
