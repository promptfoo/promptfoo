import * as fs from 'fs';
import yaml from 'js-yaml';
import * as os from 'os';
import * as path from 'path';
import { getEnvString } from '../../envars';
import logger from '../../logger';
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

export function setConfigDirectoryPath(newPath: string | undefined): void {
  configDirectoryPath = newPath;
}

export function writePromptfooConfig(
  config: Partial<UnifiedConfig>,
  outputPath: string,
): Partial<UnifiedConfig> {
  const orderedConfig = orderKeys(config, [
    'description',
    'targets',
    'prompts',
    'providers',
    'redteam',
    'defaultTest',
    'tests',
    'scenarios',
  ]);
  const yamlContent = yaml.dump(orderedConfig, { skipInvalid: true });
  if (!yamlContent) {
    logger.warn('Warning: config is empty, skipping write');
    return orderedConfig;
  }
  fs.writeFileSync(
    outputPath,
    `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json\n${yamlContent}`,
  );
  return orderedConfig;
}
