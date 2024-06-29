import { readGlobalConfig, writeGlobalConfig } from './globalConfig';

export function getUserEmail(): string | undefined {
  const globalConfig = readGlobalConfig();
  return globalConfig.account?.email;
}

export function setUserEmail(email: string) {
  writeGlobalConfig({ account: { email } });
}

export function getAuthor(): string {
  return getUserEmail() || 'Unknown';  
}