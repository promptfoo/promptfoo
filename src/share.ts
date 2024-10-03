import input from '@inquirer/input';
import chalk from 'chalk';
import type { Response } from 'node-fetch';
import { URL } from 'url';
import { SHARE_API_BASE_URL, SHARE_VIEW_BASE_URL, DEFAULT_SHARE_VIEW_BASE_URL } from './constants';
import { getEnvBool, isCI } from './envars';
import { fetchWithProxy } from './fetch';
import { getAuthor } from './globalConfig/accounts';
import { getUserEmail, setUserEmail } from './globalConfig/accounts';
import { cloudConfig } from './globalConfig/cloud';
import logger from './logger';
import type { EvaluateSummary, SharedResults, UnifiedConfig } from './types';

/**
 * Removes authentication information (username and password) from a URL.
 *
 * This function addresses a security concern raised in GitHub issue #1184,
 * where sensitive authentication information was being displayed in the CLI output.
 * By default, we now strip this information to prevent accidental exposure of credentials.
 *
 * @param urlString - The URL string that may contain authentication information.
 * @returns A new URL string with username and password removed, if present.
 *          If URL parsing fails, it returns the original string.
 */
export function stripAuthFromUrl(urlString: string): string {
  try {
    const url = new URL(urlString);
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    logger.warn('Failed to parse URL, returning original');
    return urlString;
  }
}

export async function createShareableUrl(
  results: EvaluateSummary,
  config: Partial<UnifiedConfig>,
  showAuth: boolean = false,
): Promise<string | null> {
  if (process.stdout.isTTY && !isCI() && !getEnvBool('PROMPTFOO_DISABLE_SHARE_EMAIL_REQUEST')) {
    let email = getUserEmail();
    if (!email) {
      email = await input({
        message: `${chalk.bold('Please enter your work email address')} (for managing shared URLs):`,
        validate: (value) => {
          return value.includes('@') || 'Please enter a valid email address';
        },
      });
      setUserEmail(email);
    }
  }

  const sharedResults: SharedResults = {
    data: {
      version: 3,
      createdAt: new Date().toISOString(),
      author: getAuthor(),
      results,
      config,
    },
  };

  let response: Response;
  let apiBaseUrl =
    typeof config.sharing === 'object' ? config.sharing.apiBaseUrl : SHARE_API_BASE_URL;
  // check if we're using the cloud
  if (cloudConfig.isEnabled()) {
    apiBaseUrl = cloudConfig.getApiHost();

    response = await fetchWithProxy(`${apiBaseUrl}/results`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cloudConfig.getApiKey()}`,
      },
      body: JSON.stringify(sharedResults),
    });
  } else {
    response = await fetchWithProxy(`${apiBaseUrl}/api/eval`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sharedResults),
    });
  }

  const responseJson = (await response.json()) as { id?: string; error?: string };
  if (responseJson.error) {
    throw new Error(`Failed to create shareable URL: ${responseJson.error}`);
  }

  let appBaseUrl = SHARE_VIEW_BASE_URL;
  let fullUrl = SHARE_VIEW_BASE_URL;
  if (cloudConfig.isEnabled()) {
    appBaseUrl = cloudConfig.getAppUrl();
    fullUrl = `${appBaseUrl}/results/${responseJson.id}`;
  } else {
    const appBaseUrl =
      typeof config.sharing === 'object' ? config.sharing.appBaseUrl : SHARE_VIEW_BASE_URL;
    fullUrl =
      SHARE_VIEW_BASE_URL === DEFAULT_SHARE_VIEW_BASE_URL
        ? `${appBaseUrl}/eval/${responseJson.id}`
        : `${appBaseUrl}/eval/?evalId=${responseJson.id}`;
  }

  return showAuth ? fullUrl : stripAuthFromUrl(fullUrl);
}
