import input from '@inquirer/input';
import chalk from 'chalk';
import { z } from 'zod';
import { TERMINAL_MAX_WIDTH } from '../constants';
import { getEnvString, isCI } from '../envars';
import logger from '../logger';
import {
  BAD_EMAIL_RESULT,
  BadEmailResult,
  EMAIL_OK_STATUS,
  EmailOkStatus,
  EmailValidationStatus,
  NO_EMAIL_STATUS,
  UserEmailStatus,
} from '../types/email';
import { fetchWithTimeout } from '../util/fetch/index';
import { CloudConfig } from './cloud';
import { readGlobalConfig, writeGlobalConfig, writeGlobalConfigPartial } from './globalConfig';

import type { GlobalConfig } from '../configTypes';

export function getUserId(): string {
  let globalConfig = readGlobalConfig();
  if (!globalConfig?.id) {
    const newId = crypto.randomUUID();
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
  const globalConfig = readGlobalConfig();
  const account = globalConfig?.account ?? {};
  account.email = email;
  const config: Partial<GlobalConfig> = { account };
  writeGlobalConfigPartial(config);
}

export function clearUserEmail() {
  const globalConfig = readGlobalConfig();
  const account = globalConfig?.account ?? {};
  delete account.email;
  const config: Partial<GlobalConfig> = { account };
  writeGlobalConfigPartial(config);
}

export function getUserEmailNeedsValidation(): boolean {
  const globalConfig = readGlobalConfig();
  return globalConfig?.account?.emailNeedsValidation || false;
}

export function setUserEmailNeedsValidation(needsValidation: boolean) {
  const globalConfig = readGlobalConfig();
  const account = globalConfig?.account ?? {};
  account.emailNeedsValidation = needsValidation;
  const config: Partial<GlobalConfig> = { account };
  writeGlobalConfigPartial(config);
}

export function getUserEmailValidated(): boolean {
  const globalConfig = readGlobalConfig();
  return globalConfig?.account?.emailValidated || false;
}

export function setUserEmailValidated(validated: boolean) {
  const globalConfig = readGlobalConfig();
  const account = globalConfig?.account ?? {};
  account.emailValidated = validated;
  const config: Partial<GlobalConfig> = { account };
  writeGlobalConfigPartial(config);
}

export function getAuthor(): string | null {
  return getEnvString('PROMPTFOO_AUTHOR') || getUserEmail() || null;
}

export function isLoggedIntoCloud(): boolean {
  // Check if user has authenticated with Promptfoo Cloud
  // This supports both interactive (email-based) and non-interactive (API key) authentication
  // CI environments can authenticate via API keys, so we no longer exclude CI
  const cloudConfig = new CloudConfig();
  return cloudConfig.isEnabled();
}

/**
 * Get the authentication method used for cloud access
 * @returns 'api-key' | 'email' | 'none'
 */
export function getAuthMethod(): 'api-key' | 'email' | 'none' {
  const cloudConfig = new CloudConfig();
  const hasApiKey = cloudConfig.isEnabled();
  const hasEmail = !!getUserEmail();

  if (hasApiKey && hasEmail) {
    // Both present - API key is the actual auth mechanism
    return 'api-key';
  }
  if (hasApiKey) {
    return 'api-key';
  }
  if (hasEmail) {
    // Email without API key - not fully authenticated
    // (this shouldn't happen in normal flow but handle it)
    return 'email';
  }
  return 'none';
}

interface EmailStatusResult {
  status: UserEmailStatus;
  message?: string;
  email?: string;
  hasEmail: boolean;
}

/**
 * Shared function to check email status with the promptfoo API
 * Used by both CLI and server routes
 */
export async function checkEmailStatus(options?: {
  validate?: boolean;
}): Promise<EmailStatusResult> {
  const { default: telemetry } = await import('../telemetry');
  const userEmail = isCI() ? 'ci-placeholder@promptfoo.dev' : getUserEmail();

  if (!userEmail) {
    return {
      status: NO_EMAIL_STATUS,
      hasEmail: false,
      message: 'Redteam evals require email verification. Please enter your work email:',
    };
  }

  try {
    const validateParam = options?.validate ? '&validate=true' : '';
    // Use longer timeout when validation is requested
    const timeout = options?.validate ? 3000 : 500;

    // Log when we're validating the email since it can take a sec
    if (options?.validate) {
      logger.info(`Checking email...`);
    }

    const host = getEnvString('PROMPTFOO_CLOUD_API_URL', 'https://api.promptfoo.app');

    const resp = await fetchWithTimeout(
      `${host}/api/users/status?email=${encodeURIComponent(userEmail)}${validateParam}`,
      undefined,
      timeout,
    );
    const data = (await resp.json()) as {
      status: EmailValidationStatus;
      message?: string;
      error?: string;
    };

    if (options?.validate) {
      const riskyStatuses: Set<EmailValidationStatus> = new Set([
        EmailValidationStatus.RISKY_EMAIL,
        EmailValidationStatus.DISPOSABLE_EMAIL,
      ]);
      if (riskyStatuses.has(data.status)) {
        // Tracking filtered emails via this telemetry endpoint for now to guage sensitivity of validation
        // We should take it out once we're happy with the sensitivity
        await telemetry.saveConsent(userEmail, {
          source: 'filteredInvalidEmail',
        });
      } else {
        setUserEmailValidated(true);
        // Track the validated email via telemetry
        await telemetry.saveConsent(userEmail, {
          source: 'promptForEmailValidated',
        });
      }
    }

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
      status: EmailValidationStatus.OK,
      message: 'Unable to verify email status, but proceeding',
      email: userEmail,
      hasEmail: true,
    };
  }
}

export async function promptForEmailUnverified(): Promise<{ emailNeedsValidation: boolean }> {
  const { default: telemetry } = await import('../telemetry');
  const existingEmail = getUserEmail();
  let email = isCI() ? 'ci-placeholder@promptfoo.dev' : existingEmail;
  const existingEmailNeedsValidation = !isCI() && getUserEmailNeedsValidation();
  const existingEmailValidated = isCI() || getUserEmailValidated();

  let emailNeedsValidation = existingEmailNeedsValidation && !existingEmailValidated;

  if (!email) {
    await telemetry.record('feature_used', {
      feature: 'promptForEmailUnverified',
    });

    // Display a styled prompt box
    const border = '─'.repeat(TERMINAL_MAX_WIDTH);
    logger.info('');
    logger.info(chalk.cyan(border));
    logger.info(chalk.cyan.bold('  Email Verification Required'));
    logger.info(chalk.cyan(border));
    logger.info('');
    logger.info('  Red team scans require email verification to continue.');
    logger.info('');

    const emailSchema = z.email();
    try {
      email = await input({
        message: chalk.bold('Work email:'),
        validate: (input: string) => {
          const result = emailSchema.safeParse(input);
          return result.success || result.error.issues[0].message;
        },
      });
    } catch (error) {
      const err = error as Error;
      if (err?.name === 'AbortPromptError' || err?.name === 'ExitPromptError') {
        // exit cleanly on interrupt
        process.exit(1);
      }
      // Unknown error: rethrow
      logger.error(`failed to prompt for email: ${err}`);
      throw err;
    }
    setUserEmail(email);
    setUserEmailNeedsValidation(true);
    setUserEmailValidated(false);
    emailNeedsValidation = true;
    await telemetry.record('feature_used', {
      feature: 'userCompletedPromptForEmailUnverified',
    });
  }

  return { emailNeedsValidation };
}

export async function checkEmailStatusAndMaybeExit(options?: {
  validate?: boolean;
}): Promise<EmailOkStatus | BadEmailResult> {
  const result = await checkEmailStatus(options);
  if (
    result.status === EmailValidationStatus.RISKY_EMAIL ||
    result.status === EmailValidationStatus.DISPOSABLE_EMAIL
  ) {
    logger.error('Please use a valid work email.');
    setUserEmail('');
    return BAD_EMAIL_RESULT;
  }

  if (result.status === EmailValidationStatus.EXCEEDED_LIMIT) {
    logger.error(
      'You have exceeded the maximum cloud inference limit. Please contact inquiries@promptfoo.dev to upgrade your account.',
    );
    process.exit(1);
  }

  if (result.status === EmailValidationStatus.SHOW_USAGE_WARNING && result.message) {
    const border = '='.repeat(TERMINAL_MAX_WIDTH);
    logger.info(chalk.yellow(border));
    logger.warn(chalk.yellow(result.message));
    logger.info(chalk.yellow(border));
  }

  return EMAIL_OK_STATUS;
}
