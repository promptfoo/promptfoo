import input from '@inquirer/input';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { URL } from 'url';
import { DEFAULT_SHARE_VIEW_BASE_URL, SHARE_API_BASE_URL, SHARE_VIEW_BASE_URL } from './constants';
import { getEnvBool, getEnvInt, isCI } from './envars';
import { fetchWithProxy } from './fetch';
import { getAuthor, getUserEmail, setUserEmail } from './globalConfig/accounts';
import { cloudConfig } from './globalConfig/cloud';
import logger from './logger';
import type Eval from './models/eval';
import type { SharedResults } from './types';
import { cloudCanAcceptChunkedResults } from './util/cloud';

export interface ShareDomainResult {
  domain: string;
  isPublicShare: boolean;
}

export function determineShareDomain(eval_: Eval): ShareDomainResult {
  const sharing = eval_.config.sharing;
  logger.debug(
    `Share config: isCloudEnabled=${cloudConfig.isEnabled()}, sharing=${JSON.stringify(sharing)}, evalId=${eval_.id}`,
  );

  const isPublicShare =
    !cloudConfig.isEnabled() && (!sharing || sharing === true || !('appBaseUrl' in sharing));

  const domain = isPublicShare
    ? DEFAULT_SHARE_VIEW_BASE_URL
    : cloudConfig.isEnabled()
      ? cloudConfig.getAppUrl()
      : typeof sharing === 'object' && sharing.appBaseUrl
        ? sharing.appBaseUrl
        : DEFAULT_SHARE_VIEW_BASE_URL;

  logger.debug(`Share domain determined: domain=${domain}, isPublic=${isPublicShare}`);
  return { domain, isPublicShare };
}

const VERSION_SUPPORTS_CHUNKS = '0.103.8';

function isVersionGreaterOrEqual(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true }) !== -1;
}

async function getTargetOpenSourceServerVersion(apiHost: string): Promise<string | undefined> {
  const response = await fetchWithProxy(`${apiHost}/health`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    return;
  }
  const { version } = await response.json();
  return version;
}

async function targetOpenSourceServerCanAcceptChunks(apiHost: string): Promise<boolean> {
  const version = await getTargetOpenSourceServerVersion(apiHost);
  return version != null && isVersionGreaterOrEqual(version, VERSION_SUPPORTS_CHUNKS);
}

async function targetHostCanUseNewResults(apiHost: string): Promise<boolean> {
  const version = await getTargetOpenSourceServerVersion(apiHost);
  return version != null;
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
  const response = await fetchWithProxy(`${url}/${evalId}/results`, {
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

async function rollbackEval(url: string, evalId: string, headers: Record<string, string>) {
  await fetchWithProxy(`${url}/${evalId}`, { method: 'DELETE', headers });
}

async function sendChunkedResults(evalRecord: Eval, url: string) {
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
    try {
      for (const chunk of chunks) {
        await sendChunkOfResults(chunk, url, evalId, headers);
        progressBar.increment(chunk.length);
      }
    } catch (e) {
      logger.error(`Upload failed: ${e}`);
      logger.info(`Upload failed, rolling back...`);
      await rollbackEval(url, evalId, headers);
    }

    return evalId;
  } finally {
    progressBar.stop();
  }
}

async function sendEvalResults(evalRecord: Eval, url: string) {
  await evalRecord.loadResults();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (cloudConfig.isEnabled()) {
    headers['Authorization'] = `Bearer ${cloudConfig.getApiKey()}`;
  }

  const response = await fetchWithProxy(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(evalRecord),
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

async function handleEmailCollection(evalRecord: Eval): Promise<void> {
  if (!process.stdout.isTTY || isCI() || getEnvBool('PROMPTFOO_DISABLE_SHARE_EMAIL_REQUEST')) {
    return;
  }

  let email = getUserEmail();
  if (!email) {
    email = await input({
      message: `${chalk.bold('Please enter your work email address')} (for managing shared URLs):`,
      validate: (value) => value.includes('@') || 'Please enter a valid email address',
    });
    setUserEmail(email);
  }

  evalRecord.author = email;
  await evalRecord.save();
}

async function getApiConfig(evalRecord: Eval): Promise<{
  apiBaseUrl: string;
  url: string;
  sendInChunks: boolean;
}> {
  if (cloudConfig.isEnabled()) {
    const apiBaseUrl = cloudConfig.getApiHost();
    return {
      apiBaseUrl,
      url: `${apiBaseUrl}/results`,
      sendInChunks: await cloudCanAcceptChunkedResults(),
    };
  }

  const apiBaseUrl =
    typeof evalRecord.config.sharing === 'object'
      ? evalRecord.config.sharing.apiBaseUrl || SHARE_API_BASE_URL
      : SHARE_API_BASE_URL;

  return {
    apiBaseUrl,
    url: `${apiBaseUrl}/api/eval`,
    sendInChunks: await targetOpenSourceServerCanAcceptChunks(apiBaseUrl),
  };
}

async function handleLegacyResults(
  evalRecord: Eval,
  url: string,
): Promise<string | null | undefined> {
  const summary = await evalRecord.toEvaluateSummary();
  const table = await evalRecord.getTable();

  const sharedResults: SharedResults = {
    data: {
      version: 3,
      createdAt: new Date().toISOString(),
      author: getAuthor(),
      results: { ...summary, table, version: 2 },
      config: evalRecord.config,
    },
  };

  const headers = {
    'Content-Type': 'application/json',
    ...(cloudConfig.isEnabled() && { Authorization: `Bearer ${cloudConfig.getApiKey()}` }),
  };

  const response = await fetchWithProxy(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(sharedResults),
  });

  if (!response.ok) {
    logger.error(`Failed to create shareable URL: ${response.statusText}`);
    return null;
  }

  const responseJson = (await response.json()) as { id?: string; error?: string };
  if (responseJson.error) {
    logger.error(`Failed to create shareable URL: ${responseJson.error}`);
    return null;
  }

  return responseJson.id;
}

export async function createShareableUrl(
  evalRecord: Eval,
  showAuth: boolean = false,
): Promise<string | null> {
  // 1. Handle email collection
  await handleEmailCollection(evalRecord);

  // 2. Get API configuration
  const { apiBaseUrl, url, sendInChunks } = await getApiConfig(evalRecord);

  // 3. Determine if we can use new results format
  const canUseNewResults =
    cloudConfig.isEnabled() || (await targetHostCanUseNewResults(apiBaseUrl));
  logger.debug(
    `Sharing with ${url} canUseNewResults: ${canUseNewResults} Use old results: ${evalRecord.useOldResults()}`,
  );

  // 4. Process and send results
  let evalId: string | undefined | null;
  if (canUseNewResults && !evalRecord.useOldResults()) {
    evalId = sendInChunks
      ? await sendChunkedResults(evalRecord, url)
      : await sendEvalResults(evalRecord, url);
  } else {
    evalId = await handleLegacyResults(evalRecord, url);
  }

  if (!evalId) {
    return null;
  }
  logger.debug(`New eval ID on remote instance: ${evalId}`);

  const { domain } = determineShareDomain(evalRecord);

  const fullUrl = cloudConfig.isEnabled()
    ? `${domain}/eval/${evalId}`
    : SHARE_VIEW_BASE_URL === DEFAULT_SHARE_VIEW_BASE_URL
      ? `${domain}/eval/${evalId}`
      : `${domain}/eval/?evalId=${evalId}`;

  return showAuth ? fullUrl : stripAuthFromUrl(fullUrl);
}
