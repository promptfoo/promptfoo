import input from '@inquirer/input';
import chalk from 'chalk';
import { z } from 'zod';
import type { GlobalConfig } from '../configTypes';
import { TERMINAL_MAX_WIDTH } from '../constants';
import { getEnvString, isCI } from '../envars';
import { fetchWithTimeout } from '../fetch';
import logger from '../logger';
import telemetry from '../telemetry';
import { readGlobalConfig, writeGlobalConfigPartial } from './globalConfig';

export function getUserEmail(): string | null {
  const globalConfig = readGlobalConfig();
  return globalConfig?.account?.email || null;
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
    const emailSchema = z.string().email('Please enter a valid email address');
    email = await input({
      message: 'Redteam evals require email verification. Please enter your work email:',
      validate: (input: string) => {
        const result = emailSchema.safeParse(input);
        return result.success || result.error.errors[0].message;
      },
    });
    setUserEmail(email);
  }
  await telemetry.saveConsent(email, {
    source: 'promptForEmailUnverified',
  });
}

export async function checkEmailStatusOrExit() {
  const email = isCI() ? 'ci-placeholder@promptfoo.dev' : getUserEmail();
  if (!email) {
    logger.debug('Skipping email status check because email is not set');
    return;
  }
  try {
    const resp = await fetchWithTimeout(
      `https://api.promptfoo.app/api/users/status?email=${email}`,
      undefined,
      500,
    );
    const data = (await resp.json()) as {
      status: 'ok' | 'exceeded_limit' | 'show_usage_warning';
      message?: string;
      error?: string;
    };
    if (data?.status === 'exceeded_limit') {
      logger.error(
        'You have exceeded the maximum cloud inference limit. Please contact inquiries@promptfoo.dev to upgrade your account.',
      );
      process.exit(1);
    }
    if (data?.status === 'show_usage_warning' && data?.message) {
      const border = '='.repeat(TERMINAL_MAX_WIDTH);
      logger.info(chalk.yellow(border));
      logger.warn(chalk.yellow(data.message));
      logger.info(chalk.yellow(border));
    }
  } catch (e) {
    logger.debug(`Failed to check user status: ${e}`);
  }
}
