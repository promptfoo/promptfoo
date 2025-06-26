/**
 * Functions for manipulating the global configuration file, which lives at
 * ~/.promptfoo/promptfoo.yaml by default.
 */
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import yaml from 'js-yaml';
import * as path from 'path';
import type { GlobalConfig } from '../configTypes';
import { getConfigDirectoryPath } from '../util/config/manage';

export function writeGlobalConfig(config: GlobalConfig): void {
  fs.writeFileSync(
    path.join(getConfigDirectoryPath(true), 'promptfoo.yaml') /* createIfNotExists */,
    yaml.dump(config),
  );
}

export function readGlobalConfig(): GlobalConfig {
  const configDir = getConfigDirectoryPath();
  const configFilePath = path.join(configDir, 'promptfoo.yaml');
  let globalConfig: GlobalConfig = { id: randomUUID() };
  if (fs.existsSync(configFilePath)) {
    globalConfig = (yaml.load(fs.readFileSync(configFilePath, 'utf-8')) as GlobalConfig) || {};
    if (!globalConfig?.id) {
      globalConfig = { ...globalConfig, id: randomUUID() };
      writeGlobalConfig(globalConfig);
    }
  } else {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configFilePath, yaml.dump(globalConfig));
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
