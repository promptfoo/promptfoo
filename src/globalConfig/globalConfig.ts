/**
 * Functions for manipulating the global configuration file, which lives at
 * ~/.promptfoo/promptfoo.yaml by default.
 */
import * as fs from 'fs';
import yaml from 'js-yaml';
import * as path from 'path';
import type { GlobalConfig } from '../configTypes';
import { getConfigDirectoryPath } from '../util/config/manage';

let globalConfigCache: GlobalConfig | null = null;

export function readGlobalConfig(): GlobalConfig {
  if (globalConfigCache !== null) {
    return globalConfigCache;
  }

  const configDir = getConfigDirectoryPath();
  const configFilePath = path.join(configDir, 'promptfoo.yaml');
  let globalConfig: GlobalConfig = {};

  if (fs.existsSync(configFilePath)) {
    globalConfig = (yaml.load(fs.readFileSync(configFilePath, 'utf-8')) as GlobalConfig) || {};
  } else {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configFilePath, yaml.dump(globalConfig));
  }

  globalConfigCache = globalConfig;
  return globalConfig;
}

export function writeGlobalConfig(config: GlobalConfig): void {
  globalConfigCache = config;
  const configDir = getConfigDirectoryPath(true);
  fs.writeFileSync(path.join(configDir, 'promptfoo.yaml'), yaml.dump(config));
}

/**
 * Merges the top-level keys into existing config.
 * @param partialConfig New keys to merge into the existing config.
 */
export function writeGlobalConfigPartial(partialConfig: Partial<GlobalConfig>): void {
  const currentConfig = readGlobalConfig();

  function deepMerge(target: any, source: any): any {
    if (source === null || source === undefined) {
      return undefined;
    }

    if (typeof source !== 'object') {
      return source;
    }

    const output = { ...target };

    for (const key in source) {
      if (typeof source[key] === 'object' && source[key] !== null) {
        if (key in target) {
          output[key] = deepMerge(target[key], source[key]);
        } else {
          output[key] = source[key];
        }
      } else if (source[key] !== undefined) {
        output[key] = source[key];
      }
    }

    return output;
  }

  const updatedConfig = deepMerge(currentConfig, partialConfig);
  writeGlobalConfig(updatedConfig);
}

export function clearGlobalConfigCache(): void {
  globalConfigCache = null;
}
