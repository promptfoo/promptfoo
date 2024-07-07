import { readGlobalConfig, writeGlobalConfig } from './globalConfig';

export function getUserEmail(): string | null {
  const globalConfig = readGlobalConfig();
  return globalConfig.account?.email || null;
}

export function setUserEmail(email: string) {
  writeGlobalConfig({ account: { email } });
}

export function getAuthor(): string | null {
  return process.env.PROMPTFOO_AUTHOR || getUserEmail() || null;
}
