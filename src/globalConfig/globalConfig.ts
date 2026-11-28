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

/** Read the latest configuration before applying this caller's changes. */
export function updateGlobalConfig(update: (config: GlobalConfig) => void): void {
  const config = readGlobalConfig();
  update(config);
  writeGlobalConfig(config);
}

/** Reset email verification whenever the address changes. */
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
