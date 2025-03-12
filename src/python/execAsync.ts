import { exec } from 'child_process';
import util from 'util';

/**
 * Promisified version of Node.js `exec` function.
 *
 * This wrapper was created to work around a Jest mocking limitation
 * where directly mocking `util.promisify(exec)` was not being respected
 * in tests.
 */
export const execAsync = util.promisify(exec);
