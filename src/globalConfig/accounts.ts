import type { GlobalConfig } from '../configTypes';
import { getEnvString } from '../envars';
import { readGlobalConfig, writeGlobalConfig } from './globalConfig';

export function getUserEmail(): string | null {
  const globalConfig = readGlobalConfig();
  return globalConfig.account?.email || null;
}

export function setUserEmail(email: string) {
  const config: GlobalConfig = { account: { email } };
  writeGlobalConfig(config);
}

export function getAuthor(): string | null {
  return getEnvString('PROMPTFOO_AUTHOR') || getUserEmail() || null;
}
