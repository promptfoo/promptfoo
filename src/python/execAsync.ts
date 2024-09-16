import { exec } from 'child_process';
import util from 'util';

export const execAsync = util.promisify(exec);
