import * as fs from 'fs';
import yaml from 'js-yaml';
import * as os from 'os';
import * as path from 'path';
import { getEnvString } from '../../envars';
import type { UnifiedConfig } from '../../types';
import { orderKeys } from '../json';

let configDirectoryPath: string | undefined = getEnvString('PROMPTFOO_CONFIG_DIR');

export function getConfigDirectoryPath(createIfNotExists: boolean = false): string {
  const p = configDirectoryPath || path.join(os.homedir(), '.promptfoo');
  if (createIfNotExists && !fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
  return p;
}

export function setConfigDirectoryPath(newPath: string): void {
  configDirectoryPath = newPath;
}

export function writePromptfooConfig(config: Partial<UnifiedConfig>, outputPath: string) {
  const orderedConfig = orderKeys(config, [
    'description',
    'prompts',
    'providers',
    'redteam',
    'defaultTest',
    'tests',
    'scenarios',
  ]);
  fs.writeFileSync(outputPath, yaml.dump(orderedConfig, { skipInvalid: true }));
}
