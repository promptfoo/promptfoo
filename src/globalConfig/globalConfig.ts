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

const CONFIG_FILE_MODE = 0o600;

export function writeGlobalConfig(config: GlobalConfig): void {
  const file = path.join(getConfigDirectoryPath(true), 'promptfoo.yaml');
  const contents = yaml.dump(config);
  if (process.platform === 'win32' || !config.cloud?.apiKey) {
    fs.writeFileSync(file, contents, { mode: CONFIG_FILE_MODE });
    return;
  }

  // Replace the file so a reader holding an old, permissive inode cannot read a new key.
  const existing = fs.statSync(file, { throwIfNoEntry: false });
  if (!existing && fs.lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink()) {
    throw new Error('Create the global config symlink target before saving credentials.');
  }
  const target = existing ? fs.realpathSync(file) : file;
  if (existing) {
    if (!existing.isFile()) {
      throw new Error('The global config must be a regular file to save credentials.');
    }
    fs.accessSync(target, fs.constants.W_OK);
  }
  const temporary = path.join(path.dirname(target), `.promptfoo-${crypto.randomUUID()}.tmp`);
  const fd = fs.openSync(
    temporary,
    'wx',
    existing ? existing.mode & CONFIG_FILE_MODE : CONFIG_FILE_MODE,
  );
  try {
    try {
      if (existing && existing.uid !== process.geteuid?.()) {
        fs.fchownSync(fd, existing.uid, existing.gid);
      }
      fs.writeFileSync(fd, contents);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporary, target);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

export function readGlobalConfig(): GlobalConfig {
  const configFilePath = path.join(getConfigDirectoryPath(), 'promptfoo.yaml');
  let globalConfig: GlobalConfig = {};
  if (fs.existsSync(configFilePath)) {
    const fd = fs.openSync(configFilePath, 'r');
    try {
      globalConfig = (loadYaml(fs.readFileSync(fd, 'utf-8')) as GlobalConfig) || {};
      if (process.platform !== 'win32' && globalConfig.cloud?.apiKey) {
        restrictLegacyConfig(fd);
      }
    } finally {
      fs.closeSync(fd);
    }
  }

  if (!globalConfig.id) {
    globalConfig = { ...globalConfig, id: crypto.randomUUID() };
    writeGlobalConfig(globalConfig);
  }
  return globalConfig;
}

function restrictLegacyConfig(fd: number): void {
  const { mode } = fs.fstatSync(fd);
  if ((mode & 0o077) !== 0) {
    try {
      fs.fchmodSync(fd, mode & CONFIG_FILE_MODE);
    } catch (error) {
      // Permissions on operator-managed read-only configs must be set by the operator.
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EROFS' && code !== 'EPERM' && code !== 'EACCES') {
        throw error;
      }
    }
  }
}

/**
 * Merges the top-level keys into existing config.
 * @param partialConfig New keys to merge into the existing config.
 */
export function writeGlobalConfigPartial(partialConfig: Partial<GlobalConfig>): void {
  const currentConfig = readGlobalConfig();
  // Create a shallow copy of the current config
  const updatedConfig: GlobalConfig = { ...currentConfig };

  // Use Object.entries for better type safety
  Object.entries(partialConfig).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      // Type assertion: we know key is valid from partialConfig, and value matches the key's type
      (updatedConfig as Record<string, unknown>)[key] = value;
    } else {
      // Remove the property if value is falsy
      delete (updatedConfig as Record<string, unknown>)[key];
    }
  });

  writeGlobalConfig(updatedConfig);
}
