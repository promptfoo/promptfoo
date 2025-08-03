import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

// Re-use the actual type
import type { GlobalConfig } from '../../configTypes';

// Get config directory from environment or use default
const configDir = process.env.PROMPTFOO_CONFIG_DIR || './.local/jest/config';

export function readGlobalConfig(): GlobalConfig {
  // In test environment, read from memory if available
  if ((global as any).__mockGlobalConfig) {
    return (global as any).__mockGlobalConfig;
  }

  const configFilePath = path.join(configDir, 'promptfoo.yaml');
  let globalConfig: GlobalConfig = { id: randomUUID() };

  if (fs.existsSync(configFilePath)) {
    try {
      globalConfig = (yaml.load(fs.readFileSync(configFilePath, 'utf-8')) as GlobalConfig) || {};
    } catch (_err) {
      // Ignore errors in test environment
    }
    if (!globalConfig.id) {
      globalConfig = { ...globalConfig, id: randomUUID() };
    }
  }

  return globalConfig;
}

export function writeGlobalConfig(config: GlobalConfig): void {
  // In test environment, don't actually write to disk to avoid interfering with mocks
  // Store in memory instead
  (global as any).__mockGlobalConfig = config;
}

export function writeGlobalConfigPartial(partialConfig: Partial<GlobalConfig>): void {
  const config = readGlobalConfig();
  const newConfig = { ...config, ...partialConfig };
  writeGlobalConfig(newConfig);
}

export function maybeReadGlobalConfig(): GlobalConfig | null {
  try {
    return readGlobalConfig();
  } catch {
    return null;
  }
}

// Re-export the type
export type { GlobalConfig } from '../../configTypes';
