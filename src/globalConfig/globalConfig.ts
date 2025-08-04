/**
 * Functions for manipulating the global configuration file, which lives at
 * ~/.promptfoo/promptfoo.yaml by default.
 */
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

import yaml from 'js-yaml';
import { getConfigDirectoryPath } from '../util/config/manage';

import type { GlobalConfig } from '../configTypes';

export async function writeGlobalConfig(config: GlobalConfig): Promise<void> {
  await fs.writeFile(
    path.join(getConfigDirectoryPath(true), 'promptfoo.yaml') /* createIfNotExists */,
    yaml.dump(config),
  );
}

export async function readGlobalConfig(): Promise<GlobalConfig> {
  const configDir = getConfigDirectoryPath();
  const configFilePath = path.join(configDir, 'promptfoo.yaml');
  let globalConfig: GlobalConfig = { id: randomUUID() };
  try {
    await fs.access(configFilePath);
    globalConfig = (yaml.load(await fs.readFile(configFilePath, 'utf-8')) as GlobalConfig) || {};
    if (!globalConfig?.id) {
      globalConfig = { ...globalConfig, id: randomUUID() };
      await writeGlobalConfig(globalConfig);
    }
  } catch {
    try {
      await fs.access(configDir);
    } catch {
      await fs.mkdir(configDir, { recursive: true });
    }
    await fs.writeFile(configFilePath, yaml.dump(globalConfig));
  }

  return globalConfig;
}

/**
 * Merges the top-level keys into existing config.
 * @param partialConfig New keys to merge into the existing config.
 */
export async function writeGlobalConfigPartial(partialConfig: Partial<GlobalConfig>): Promise<void> {
  const currentConfig = await readGlobalConfig();
  // Create a shallow copy of the current config
  const updatedConfig = { ...currentConfig };

  // Use Object.entries for better type safety
  Object.entries(partialConfig).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      // Type assertion for key - we know it's a valid key from partialConfig
      (updatedConfig as any)[key] = value;
    } else {
      // Remove the property if value is falsy
      delete (updatedConfig as any)[key];
    }
  });

  await writeGlobalConfig(updatedConfig);
}
