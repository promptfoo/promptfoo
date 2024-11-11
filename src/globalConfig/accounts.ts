import input from '@inquirer/input';
import chalk from 'chalk';
import dedent from 'dedent';
import type { GlobalConfig } from '../configTypes';
import { getEnvString, isCI } from '../envars';
import logger from '../logger';
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

export function getVerifiedEmailKey(): string | null {
  const globalConfig = readGlobalConfig();
  return globalConfig.account?.verifiedEmailKey || null;
}

export function setVerifiedEmailKey(key: string) {
  const config: Partial<GlobalConfig> = { account: { verifiedEmailKey: key } };
  writeGlobalConfigPartial(config);
}

export async function promptForEmailUnverified() {
  let email = isCI() ? 'ci-placeholder@promptfoo.dev' : getUserEmail();
  if (!email) {
    email = await input({
      message: dedent`
        ${chalk.blue('Redteam scans require email verification.')}
        Please enter your work email:
      `,
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

const VERIFICATION_BASE_URL = 'https://api.promptfoo.app/email-verification';
const VERIFICATION_TIMEOUT_MS = 10 * 60 * 1000;

export async function promptForEmailVerified() {
  // First ensure we have an email
  await promptForEmailUnverified();
  const email = getUserEmail();
  if (!email) {
    throw new Error('Failed to collect email');
  }

  // Check if we already have a verified key
  const existingKey = getVerifiedEmailKey();
  if (existingKey) {
    return;
  }

  // Request verification
  const response = await fetch(VERIFICATION_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to request email verification');
  }

  const { verificationId } = await response.json();

  logger.info(
    chalk.bold.blue(`📧 Please check your email (${email}) and click the verification link.`),
  );

  const startTime = Date.now();

  // Poll for verification status
  while (true) {
    if (Date.now() - startTime > VERIFICATION_TIMEOUT_MS) {
      throw new Error('Email verification timed out after 10 minutes. Please try again.');
    }

    logger.debug(`Checking verification status for ${verificationId}`);
    const checkResponse = await fetch(`${VERIFICATION_BASE_URL}/${verificationId}/status`);
    const json = await checkResponse.json();
    logger.debug(`Verification status: ${JSON.stringify(json)}`);
    if (!checkResponse.ok) {
      throw new Error(json.error || 'Failed to check verification status');
    }

    const { verified, apiKey } = json;
    if (verified && apiKey) {
      setVerifiedEmailKey(apiKey);
      logger.info(chalk.green('✅ Email verified successfully!'));
      await telemetry.saveConsent(email, {
        source: 'promptForEmail - VERIFIED',
      });
      return;
    }

    // Wait 5 seconds before checking again
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
