import input from '@inquirer/input';
import type { GlobalConfig } from '../configTypes';
import { getEnvString, isCI } from '../envars';
import telemetry from '../telemetry';
import { readGlobalConfig, writeGlobalConfigPartial } from './globalConfig';

export function getUserEmail(): string | null {
  const globalConfig = readGlobalConfig();
  return globalConfig.account?.email || null;
}

export function setUserEmail(email: string) {
  const config: Partial<GlobalConfig> = { account: { email } };
  writeGlobalConfigPartial(config);
}

export function getAuthor(): string | null {
  return getEnvString('PROMPTFOO_AUTHOR') || getUserEmail() || null;
}

export async function promptForEmailUnverified() {
  let email = isCI() ? 'ci-placeholder@promptfoo.dev' : getUserEmail();
  if (!email) {
    email = await input({
      message: 'Redteam evals require email verification. Please enter your work email:',
      validate: (input: string) => {
        if (!input || !input.includes('@')) {
          return 'Email is required';
        }
        return true;
      },
    });
    setUserEmail(email);
  }
  await telemetry.saveConsent(email, {
    source: 'promptForEmailUnverified',
  });
}
