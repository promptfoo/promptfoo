import fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { getEnvString } from '../../envars';

// Keep programmatic overrides separate from the environment so an --env-file loaded after this
// module is imported can still select the config directory.
let configDirectoryPath: string | undefined;

// Check if we're in a Node.js environment
const isNodeEnvironment =
  typeof process !== 'undefined' && process.versions && process.versions.node;

export function getConfigDirectoryPath(createIfNotExists: boolean = false): string {
  const p =
    configDirectoryPath ||
    getEnvString('PROMPTFOO_CONFIG_DIR') ||
    path.join(os.homedir(), '.promptfoo');

  // Only perform filesystem operations in Node.js environment
  if (createIfNotExists && isNodeEnvironment) {
    try {
      // mkdirSync with recursive:true is idempotent - no need to check existence first
      fs.mkdirSync(p, { recursive: true });
    } catch {
      // Silently ignore filesystem errors in browser environment
    }
  }

  return p;
}

export function setConfigDirectoryPath(newPath: string | undefined): void {
  configDirectoryPath = newPath;
}
