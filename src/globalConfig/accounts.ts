import input from '@inquirer/input';
import chalk from 'chalk';
import dedent from 'dedent';
import type { GlobalConfig } from '../configTypes';
import { getEnvString, isCI } from '../envars';
import { fetchWithProxy } from '../fetch';
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
  return (
    getEnvString('PROMPTFOO_VERIFICATION_KEY') || globalConfig.account?.verifiedEmailKey || null
  );
}

export function setVerifiedEmailKey(key: string) {
  const config: Partial<GlobalConfig> = { account: { verifiedEmailKey: key } };
  writeGlobalConfigPartial(config);
}

export async function promptForEmailUnverified() {
  let email = getUserEmail();
  const isFirstTime = !email;
  if (!email) {
    if (isCI()) {
      logger.warn(dedent`It looks like you're running Promptfoo redteam in CI. This requires a verified email:

          promptfoo config set email <your-email@work.com>
          promptfoo config set verificationKey <verification-key>

        If you don't have a verification key, you can generate one with:

          promptfoo auth verify
      `);
    }
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
    source: isFirstTime
      ? 'promptForEmail - Unverified - first time'
      : 'promptForEmail - Unverified',
  });
}

const VERIFICATION_BASE_URL = 'https://api.promptfoo.app/email-verification';
const VERIFICATION_TIMEOUT_MS = 10 * 60 * 1000;

export async function promptForEmailVerified() {
  const email = getUserEmail();
  const existingKey = getVerifiedEmailKey();

  if (existingKey) {
    // Email may be undefined if the verified key was set manually
    await telemetry.saveConsent(email || existingKey, {
      source: 'promptForEmail - VERIFIED',
    });
    return;
  }

  await promptForEmailUnverified();
  if (!email) {
    throw new Error('Failed to collect email');
  }

  // Request verification
  const response = await fetchWithProxy(VERIFICATION_BASE_URL, {
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
    const checkResponse = await fetchWithProxy(`${VERIFICATION_BASE_URL}/${verificationId}/status`);
    const json = await checkResponse.json();
    logger.debug(`Verification status: ${JSON.stringify(json)}`);
    if (!checkResponse.ok) {
      throw new Error(json.error || 'Failed to check verification status');
    }

    const { verified, apiKey } = json;
    if (verified && apiKey) {
      setVerifiedEmailKey(apiKey);
      logger.info(chalk.green('✅ Email verified successfully!'));
      logger.info(`Your verification key has been saved: ${apiKey}`);
      await telemetry.saveConsent(email, {
        source: 'promptForEmail - VERIFIED - first time',
      });
      return;
    }

    // Wait 5 seconds before checking again
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
