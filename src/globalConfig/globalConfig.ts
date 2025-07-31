/**
 * Functions for manipulating the global configuration file, which lives at
 * ~/.promptfoo/promptfoo.yaml by default.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

import yaml from 'js-yaml';
import { getConfigDirectoryPath } from '../util/config/manage';

import type { GlobalConfig } from '../configTypes';

export function writeGlobalConfig(config: GlobalConfig): void {
  writeFileSync(
    path.join(getConfigDirectoryPath(true), 'promptfoo.yaml') /* createIfNotExists */,
    yaml.dump(config),
  );
}

export function readGlobalConfig(): GlobalConfig {
  const configDir = getConfigDirectoryPath();
  const configFilePath = path.join(configDir, 'promptfoo.yaml');
  let globalConfig: GlobalConfig = { id: randomUUID() };
  if (existsSync(configFilePath)) {
    globalConfig = (yaml.load(readFileSync(configFilePath, 'utf-8')) as GlobalConfig) || {};
    if (!globalConfig?.id) {
      globalConfig = { ...globalConfig, id: randomUUID() };
      writeGlobalConfig(globalConfig);
    }
  } else {
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    writeFileSync(configFilePath, yaml.dump(globalConfig));
  }

  return globalConfig;
}

/**
 * Merges the top-level keys into existing config.
 * @param partialConfig New keys to merge into the existing config.
 */
export function writeGlobalConfigPartial(partialConfig: Partial<GlobalConfig>): void {
  const currentConfig = readGlobalConfig();
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

  writeGlobalConfig(updatedConfig);
}
