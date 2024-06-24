/**
 * Functions for manipulating the global configuration file, which lives at
 * ~/.promptfoo/promptfoo.yaml by default.
 */
import * as fs from 'fs';
import yaml from 'js-yaml';
import * as path from 'path';

import { getConfigDirectoryPath } from './util';

interface GlobalConfig {
  hasRun?: boolean;
  account?: {
    email?: string;
  };
}

let globalConfigCache: GlobalConfig | null = null;

export function resetGlobalConfig(): void {
  globalConfigCache = null;
}

export function readGlobalConfig(): GlobalConfig {
  if (!globalConfigCache) {
    const configDir = getConfigDirectoryPath();
    const configFilePath = path.join(configDir, 'promptfoo.yaml');

    if (fs.existsSync(configFilePath)) {
      globalConfigCache = yaml.load(fs.readFileSync(configFilePath, 'utf-8')) as GlobalConfig;
    } else {
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      globalConfigCache = { hasRun: false };
      fs.writeFileSync(configFilePath, yaml.dump(globalConfigCache));
    }
  }

  return globalConfigCache;
}

export function writeGlobalConfig(config: GlobalConfig): void {
  fs.writeFileSync(
    path.join(getConfigDirectoryPath(true /* createIfNotExists */), 'promptfoo.yaml'),
    yaml.dump(config),
  );
}

/**
 * Merges the top-level keys into existing config.
 * @param partialConfig New keys to merge into the existing config.
 */
export function writeGlobalConfigPartial(partialConfig: Partial<GlobalConfig>): void {
  const currentConfig = readGlobalConfig();
  const updatedConfig = { ...currentConfig };

  for (const key in partialConfig) {
    const value = partialConfig[key as keyof GlobalConfig];
    if (value) {
      updatedConfig[key as keyof GlobalConfig] = value as any;
    } else {
      delete updatedConfig[key as keyof GlobalConfig];
    }
  }

  writeGlobalConfig(updatedConfig);
}

export function maybeRecordFirstRun(): boolean {
  // Return true if first run
  try {
    const config = readGlobalConfig();
    if (!config.hasRun) {
      config.hasRun = true;
      writeGlobalConfig(config);
      return true;
    }
    return false;
  } catch (err) {
    return false;
  }
}
