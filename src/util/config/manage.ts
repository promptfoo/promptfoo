import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { getEnvString } from '../../envars';

let configDirectoryPath: string | undefined = getEnvString('PROMPTFOO_CONFIG_DIR');

export function getConfigDirectoryPath(createIfNotExists: boolean = false): string {
  const p = configDirectoryPath || path.join(os.homedir(), '.promptfoo');
  if (createIfNotExists && !fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
  return p;
}

export function setConfigDirectoryPath(newPath: string | undefined): void {
  configDirectoryPath = newPath;
}
