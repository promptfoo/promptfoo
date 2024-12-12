import input from '@inquirer/input';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { URL } from 'url';
import { SHARE_API_BASE_URL, SHARE_VIEW_BASE_URL, DEFAULT_SHARE_VIEW_BASE_URL } from './constants';
import { getEnvBool, getEnvInt, isCI } from './envars';
import { fetchWithProxy } from './fetch';
import { getAuthor } from './globalConfig/accounts';
import { getUserEmail, setUserEmail } from './globalConfig/accounts';
import { cloudConfig } from './globalConfig/cloud';
import logger from './logger';
import type Eval from './models/eval';
import type { SharedResults } from './types';
import invariant from './util/invariant';

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
  return 'version' in responseJson;
}

// Helper functions
function getResultSize(result: any): number {
  return Buffer.byteLength(JSON.stringify(result), 'utf8');
}

function calculateMedianResultSize(results: any[], sampleSize: number = 25): number {
  // Get the result size of the first sampleSize results
  const sampleSizes = results.slice(0, Math.min(sampleSize, results.length)).map(getResultSize);
  // Return the median result size
  return sampleSizes.sort((a, b) => a - b)[Math.floor(sampleSizes.length / 2)];
}

function createChunks(results: any[], targetChunkSize: number): any[][] {
  const medianSize = calculateMedianResultSize(results);
  const estimatedResultsPerChunk =
    getEnvInt('PROMPTFOO_SHARE_CHUNK_SIZE') ??
    Math.max(1, Math.floor(targetChunkSize / medianSize));

  logger.debug(
    `Median result size: ${medianSize} bytes, estimated results per chunk: ${estimatedResultsPerChunk}`,
  );

  const chunks: any[][] = [];
  for (let i = 0; i < results.length; i += estimatedResultsPerChunk) {
    chunks.push(results.slice(i, i + estimatedResultsPerChunk));
  }

  return chunks;
}

async function sendInitialEvalData(evalRecord: Eval, url: string, headers: Record<string, string>) {
  const evalDataWithoutResults = { ...evalRecord, results: [] };
  const response = await fetchWithProxy(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(evalDataWithoutResults),
  });

  if (!response.ok) {
    throw new Error(`Failed to send initial eval data: ${response.statusText}`);
  }

  return (await response.json()).id;
}

async function sendChunkOfResults(
  chunk: any[],
  url: string,
  evalId: string,
  headers: Record<string, string>,
) {
  const response = await fetch(`${url}/${evalId}/results`, {
    method: 'POST',
    headers,
    body: JSON.stringify(chunk),
  });

  if (!response.ok) {
    const responseBody = await response.json();
    throw new Error(
      `Failed to send results chunk: ${response.statusText} = ${JSON.stringify(responseBody)}`,
    );
  }
}

async function sendEvalResults(evalRecord: Eval, url: string) {
  await evalRecord.loadResults();
  const allResults = evalRecord.results;
  logger.debug(`Loaded ${allResults.length} results`);

  // Constants
  const TARGET_CHUNK_SIZE = 2 * 1024 * 1024; // 2MB in bytes

  // Calculate chunk sizes
  const medianSize = calculateMedianResultSize(allResults);
  logger.debug(`Median result size: ${medianSize} bytes`);

  // Create chunks
  const chunks = createChunks(allResults, TARGET_CHUNK_SIZE);

  // Prepare headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (cloudConfig.isEnabled()) {
    headers['Authorization'] = `Bearer ${cloudConfig.getApiKey()}`;
  }

  // Setup progress bar
  const progressBar = new cliProgress.SingleBar(
    {
      format: 'Sharing | {bar} | {percentage}% | {value}/{total} results',
    },
    cliProgress.Presets.shades_classic,
  );
  progressBar.start(allResults.length, 0);

  try {
    // Send initial data and get eval ID
    const evalId = await sendInitialEvalData(evalRecord, url, headers);
    logger.debug(`Initial eval data sent successfully - ${evalId}`);

    // Send chunks
    logger.debug(`Sending ${chunks.length} requests to upload results`);
    for (const chunk of chunks) {
      await sendChunkOfResults(chunk, url, evalId, headers);
      progressBar.increment(chunk.length);
    }

    return evalId;
  } finally {
    progressBar.stop();
  }
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
  evalRecord: Eval,
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
    evalRecord.author = email;
    await evalRecord.save();
  }

  let response: Response;
  let apiBaseUrl: string;
  let url: string;
  if (cloudConfig.isEnabled()) {
    apiBaseUrl = cloudConfig.getApiHost();
    url = `${apiBaseUrl}/results`;

    const loggedInEmail = getUserEmail();
    invariant(loggedInEmail, 'User email is not set');
    const evalAuthor = evalRecord.author;
    if (evalAuthor !== loggedInEmail) {
      logger.warn(
        `Warning: Changing eval author from ${evalAuthor} to logged-in user ${loggedInEmail}`,
      );
    }
    evalRecord.author = loggedInEmail;
    await evalRecord.save();
  } else {
    apiBaseUrl =
      typeof evalRecord.config.sharing === 'object'
        ? evalRecord.config.sharing.apiBaseUrl || SHARE_API_BASE_URL
        : SHARE_API_BASE_URL;

    url = `${apiBaseUrl}/api/eval`;
  }

  const canUseNewResults =
    cloudConfig.isEnabled() || (await targetHostCanUseNewResults(apiBaseUrl));
  logger.debug(
    `Sharing with ${url} canUseNewResults: ${canUseNewResults} Use old results: ${evalRecord.useOldResults()}`,
  );
  let evalId: string | undefined;
  if (canUseNewResults && !evalRecord.useOldResults()) {
    evalId = await sendEvalResults(evalRecord, url);
  } else {
    const summary = await evalRecord.toEvaluateSummary();
    const table = await evalRecord.getTable();
    const v2Summary = {
      ...summary,
      table,
      version: 2,
    };

    logger.debug(`Sending eval results (v2 result file) to ${url}`);
    // check if we're using the cloud
    const sharedResults: SharedResults = {
      data: {
        version: 3,
        createdAt: new Date().toISOString(),
        author: getAuthor(),
        results: v2Summary,
        config: evalRecord.config,
      },
    };
    if (cloudConfig.isEnabled()) {
      response = await fetchWithProxy(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cloudConfig.getApiKey()}`,
        },
        body: JSON.stringify(sharedResults),
      });
    } else {
      response = await fetchWithProxy(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sharedResults),
      });
    }
    if (!response.ok) {
      logger.error(`Failed to create shareable URL: ${response.statusText}`);
      return null;
    }
    const responseJson = (await response.json()) as { id?: string; error?: string };
    if (responseJson.error) {
      logger.error(`Failed to create shareable URL: ${responseJson.error}`);
      return null;
    }
    evalId = responseJson.id;
  }
  logger.debug(`New eval ID on remote instance: ${evalId}`);
  let appBaseUrl = SHARE_VIEW_BASE_URL;
  let fullUrl = SHARE_VIEW_BASE_URL;
  if (cloudConfig.isEnabled()) {
    appBaseUrl = cloudConfig.getAppUrl();
    fullUrl = `${appBaseUrl}/eval/${evalId}`;
  } else {
    const appBaseUrl =
      typeof evalRecord.config.sharing === 'object'
        ? evalRecord.config.sharing.appBaseUrl
        : SHARE_VIEW_BASE_URL;
    fullUrl =
      SHARE_VIEW_BASE_URL === DEFAULT_SHARE_VIEW_BASE_URL
        ? `${appBaseUrl}/eval/${evalId}`
        : `${appBaseUrl}/eval/?evalId=${evalId}`;
  }

  return showAuth ? fullUrl : stripAuthFromUrl(fullUrl);
}
