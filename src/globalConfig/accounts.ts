import { randomUUID } from 'crypto';

import input from '@inquirer/input';
import chalk from 'chalk';
import { z } from 'zod';
import { TERMINAL_MAX_WIDTH } from '../constants';
import { getEnvString, isCI } from '../envars';
import logger from '../logger';
import { fetchWithTimeout } from '../util/fetch';
import { readGlobalConfig, writeGlobalConfig, writeGlobalConfigPartial } from './globalConfig';

import type { GlobalConfig } from '../configTypes';

export function getUserId(): string {
  let globalConfig = readGlobalConfig();
  if (!globalConfig?.id) {
    const newId = randomUUID();
    globalConfig = { ...globalConfig, id: newId };
    writeGlobalConfig(globalConfig);
    return newId;
  }

  return globalConfig.id;
}

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

export function isLoggedIntoCloud(): boolean {
  const userEmail = getUserEmail();
  return !!userEmail && !isCI();
}

interface EmailStatusResult {
  status: 'ok' | 'exceeded_limit' | 'show_usage_warning' | 'no_email';
  message?: string;
  email?: string;
  hasEmail: boolean;
}

/**
 * Shared function to check email status with the promptfoo API
 * Used by both CLI and server routes
 */
export async function checkEmailStatus(): Promise<EmailStatusResult> {
  const userEmail = isCI() ? 'ci-placeholder@promptfoo.dev' : getUserEmail();

  if (!userEmail) {
    return {
      status: 'no_email',
      hasEmail: false,
      message: 'Redteam evals require email verification. Please enter your work email:',
    };
  }

  try {
    const resp = await fetchWithTimeout(
      `https://api.promptfoo.app/api/users/status?email=${encodeURIComponent(userEmail)}`,
      undefined,
      500,
    );
    const data = (await resp.json()) as {
      status: 'ok' | 'exceeded_limit' | 'show_usage_warning';
      message?: string;
      error?: string;
    };

    return {
      status: data.status,
      message: data.message,
      email: userEmail,
      hasEmail: true,
    };
  } catch (e) {
    logger.debug(`Failed to check user status: ${e}`);
    // If we can't check status, assume it's OK but log the issue
    return {
      status: 'ok',
      message: 'Unable to verify email status, but proceeding',
      email: userEmail,
      hasEmail: true,
    };
  }
}

export async function promptForEmailUnverified() {
  const { default: telemetry } = await import('../telemetry');
  let email = isCI() ? 'ci-placeholder@promptfoo.dev' : getUserEmail();
  if (!email) {
    await telemetry.record('feature_used', {
      feature: 'promptForEmailUnverified',
    });
    const emailSchema = z.string().email('Please enter a valid email address');
    email = await input({
      message: 'Redteam evals require email verification. Please enter your work email:',
      validate: (input: string) => {
        const result = emailSchema.safeParse(input);
        return result.success || result.error.errors[0].message;
      },
    });
    setUserEmail(email);
    await telemetry.record('feature_used', {
      feature: 'userCompletedPromptForEmailUnverified',
    });
  }
  await telemetry.saveConsent(email, {
    source: 'promptForEmailUnverified',
  });
}

export async function checkEmailStatusOrExit() {
  const result = await checkEmailStatus();

  if (result.status === 'exceeded_limit') {
    logger.error(
      'You have exceeded the maximum cloud inference limit. Please contact inquiries@promptfoo.dev to upgrade your account.',
    );
    process.exit(1);
  }

  if (result.status === 'show_usage_warning' && result.message) {
    const border = '='.repeat(TERMINAL_MAX_WIDTH);
    logger.info(chalk.yellow(border));
    logger.warn(chalk.yellow(result.message));
    logger.info(chalk.yellow(border));
  }
}
