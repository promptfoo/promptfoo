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
import type Eval from './models/eval';
import type { EvaluateSummary, SharedResults, UnifiedConfig } from './types';

async function targetHostCanUseNewResults(apiHost: string): Promise<boolean> {
  const response = await fetchWithProxy(`${apiHost}/health`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    return false;
  }
  const responseJson = await response.json();
  console.log({ responseJson });
  return 'version' in responseJson;
}

async function sendEvalResults(dbRecord: Eval, apiHost: string) {
  await dbRecord.loadResults();
  logger.debug(`Sending eval results (v4) to ${apiHost}`);
  const response = await fetchWithProxy(`${apiHost}/api/eval`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(dbRecord),
  });

  if (!response.ok) {
    throw new Error(`Failed to send eval results: ${response.statusText}`);
  }

  const evalId = (await response.json()).id;
  return evalId;
}

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
  databaseRecord: Eval | null = null,
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

  let response: Response;
  let apiBaseUrl =
    typeof config.sharing === 'object'
      ? config.sharing.apiBaseUrl || SHARE_API_BASE_URL
      : SHARE_API_BASE_URL;

  if (cloudConfig.isEnabled()) {
    apiBaseUrl = cloudConfig.getApiHost();
  }

  const canUseNewResults = await targetHostCanUseNewResults(apiBaseUrl);
  logger.debug(
    `Sharing with ${apiBaseUrl} canUseNewResults: ${canUseNewResults} Use old results: ${databaseRecord?.useOldResults()}`,
  );
  let evalId: string | undefined;
  if (canUseNewResults && databaseRecord && !databaseRecord.useOldResults()) {
    evalId = await sendEvalResults(databaseRecord, apiBaseUrl);
  } else {
    logger.debug(`Sending eval results (v3) to ${apiBaseUrl}`);
    // check if we're using the cloud
    const sharedResults: SharedResults = {
      data: {
        version: 3,
        createdAt: new Date().toISOString(),
        author: getAuthor(),
        results,
        config,
      },
    };
    if (!results.table && databaseRecord) {
      logger.debug(`Getting table from database record`);
      results.table = await databaseRecord?.getTable();
    }
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
    evalId = responseJson.id;
  }
  logger.debug(`New eval ID on remote instance: ${evalId}`);
  let appBaseUrl = SHARE_VIEW_BASE_URL;
  let fullUrl = SHARE_VIEW_BASE_URL;
  if (cloudConfig.isEnabled()) {
    appBaseUrl = cloudConfig.getAppUrl();
    fullUrl = `${appBaseUrl}/results/${evalId}`;
  } else {
    const appBaseUrl =
      typeof config.sharing === 'object' ? config.sharing.appBaseUrl : SHARE_VIEW_BASE_URL;
    fullUrl =
      SHARE_VIEW_BASE_URL === DEFAULT_SHARE_VIEW_BASE_URL
        ? `${appBaseUrl}/eval/${evalId}`
        : `${appBaseUrl}/eval/?evalId=${evalId}`;
  }

  return showAuth ? fullUrl : stripAuthFromUrl(fullUrl);
}
