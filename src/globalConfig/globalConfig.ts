/**
 * Functions for manipulating the global configuration file, which lives at
 * ~/.promptfoo/promptfoo.yaml by default.
 */
import * as fs from 'fs';
import * as path from 'path';

import * as yaml from 'js-yaml';
import { getConfigDirectoryPath } from '../util/config/manage';
import { loadYaml } from '../util/yamlLoad';

import type { GlobalConfig } from '../configTypes';

export function writeGlobalConfig(config: GlobalConfig): void {
  const configPath = path.join(getConfigDirectoryPath(true), 'promptfoo.yaml');
  const temporaryPath = `${configPath}.${crypto.randomUUID()}.tmp`;
  const mode = fs.existsSync(configPath) ? fs.statSync(configPath).mode & 0o777 : 0o600;
  try {
    fs.writeFileSync(temporaryPath, yaml.dump(config), { mode, flag: 'wx' });
    // Preserve existing permissions even when the process umask is more restrictive.
    fs.chmodSync(temporaryPath, mode);
    fs.renameSync(temporaryPath, configPath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

/** Read the latest config and persist only the caller's changes in one replacement. */
export function updateGlobalConfig(update: (config: GlobalConfig) => void): void {
  const config = readGlobalConfig();
  update(config);
  writeGlobalConfig(config);
}

/** Email verification belongs to the saved address, not to the installation. */
export function updateAccountEmail(config: GlobalConfig, email?: string): void {
  const account = (config.account ??= {});
  if (email) {
    if (account.email !== email) {
      account.emailValidated = false;
      account.emailNeedsValidation = true;
    }
    account.email = email;
  } else {
    delete account.email;
    delete account.emailValidated;
    delete account.emailNeedsValidation;
  }
}

export function readGlobalConfig(): GlobalConfig {
  const configDir = getConfigDirectoryPath();
  const configFilePath = path.join(configDir, 'promptfoo.yaml');
  let globalConfig: GlobalConfig = { id: crypto.randomUUID() };
  if (fs.existsSync(configFilePath)) {
    globalConfig = (loadYaml(fs.readFileSync(configFilePath, 'utf-8')) as GlobalConfig) || {};
    if (!globalConfig?.id) {
      globalConfig = { ...globalConfig, id: crypto.randomUUID() };
      writeGlobalConfig(globalConfig);
    }
  } else {
    writeGlobalConfig(globalConfig);
  }

  return globalConfig;
}

/**
 * Merges the top-level keys into existing config.
 * @param partialConfig New keys to merge into the existing config.
 */
export function writeGlobalConfigPartial(partialConfig: Partial<GlobalConfig>): void {
  updateGlobalConfig((config) => {
    for (const [key, value] of Object.entries(partialConfig)) {
      if (value !== undefined && value !== null) {
        (config as Record<string, unknown>)[key] = value;
      } else {
        delete (config as Record<string, unknown>)[key];
      }
    }
  });
}
