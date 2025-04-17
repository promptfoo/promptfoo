import input from '@inquirer/input';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { URL } from 'url';
import { DEFAULT_SHARE_VIEW_BASE_URL, SHARE_API_BASE_URL, SHARE_VIEW_BASE_URL } from './constants';
import { getEnvBool, getEnvInt, isCI, getEnvString } from './envars';
import { fetchWithProxy } from './fetch';
import { getAuthor, getUserEmail, setUserEmail } from './globalConfig/accounts';
import { cloudConfig } from './globalConfig/cloud';
import logger from './logger';
import type Eval from './models/eval';
import type { SharedResults } from './types';
import { cloudCanAcceptChunkedResults, makeRequest as makeCloudRequest } from './util/cloud';

export interface ShareDomainResult {
  domain: string;
  isPublicShare: boolean;
}

export function isSharingEnabled(evalRecord: Eval): boolean {
  const sharingConfigOnEval =
    typeof evalRecord.config.sharing === 'object' ? evalRecord.config.sharing.apiBaseUrl : null;
  const sharingEnvUrl = SHARE_API_BASE_URL;

  const cloudSharingUrl = cloudConfig.isEnabled() ? cloudConfig.getApiHost() : null;

  if (sharingConfigOnEval) {
    return true;
  }

  if (sharingEnvUrl && !sharingEnvUrl.includes('api.promptfoo.app')) {
    return true;
  }

  if (cloudSharingUrl) {
    return true;
  }

  return false;
}

export function determineShareDomain(eval_: Eval): ShareDomainResult {
  const sharing = eval_.config.sharing;
  logger.debug(
    `Share config: isCloudEnabled=${cloudConfig.isEnabled()}, sharing=${JSON.stringify(sharing)}, evalId=${eval_.id}`,
  );

  const isPublicShare =
    !cloudConfig.isEnabled() && (!sharing || sharing === true || !('appBaseUrl' in sharing));

  const envAppBaseUrl = getEnvString('PROMPTFOO_REMOTE_APP_BASE_URL');

  const domain = isPublicShare
    ? envAppBaseUrl || DEFAULT_SHARE_VIEW_BASE_URL
    : cloudConfig.isEnabled()
      ? cloudConfig.getAppUrl()
      : typeof sharing === 'object' && sharing.appBaseUrl
        ? sharing.appBaseUrl
        : envAppBaseUrl || DEFAULT_SHARE_VIEW_BASE_URL;

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
    logger.debug(`Failed to get server version from ${apiHost}/health: ${response.statusText}`);
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
  // PROMPTFOO_SHARE_CHUNK_SIZE lets you directly specify how many results to include in each chunk.
  // The value represents the number of results per chunk, not a byte size.
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
  logger.debug(`Sending initial eval data to ${url}`);
  const response = await fetchWithProxy(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(evalDataWithoutResults),
  });

  if (!response.ok) {
    throw new Error(`Failed to send initial eval data to ${url}: ${response.statusText}`);
  }

  return (await response.json()).id;
}

async function sendChunkOfResults(
  chunk: any[],
  url: string,
  evalId: string,
  headers: Record<string, string>,
) {
  const targetUrl = `${url}/${evalId}/results`;
  logger.debug(`Sending chunk of ${chunk.length} results to ${targetUrl}`);
  const response = await fetchWithProxy(targetUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(chunk),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    logger.error(
      `Failed to send results chunk to ${targetUrl}: status code: ${response.status}, status text: ${response.statusText}, body: ${responseBody}`,
    );
    throw new Error(`Failed to send results chunk`);
  }
}

async function rollbackEval(url: string, evalId: string, headers: Record<string, string>) {
  const targetUrl = `${url}/${evalId}`;
  logger.debug(`Attempting to roll back eval ${evalId} at ${targetUrl}`);
  try {
    const response = await fetchWithProxy(targetUrl, { method: 'DELETE', headers });
    if (response.ok) {
      logger.debug(`Successfully rolled back eval ${evalId}`);
    } else {
      logger.warn(`Rollback request returned non-OK status: ${response.statusText}`);
    }
  } catch (e) {
    logger.warn(
      `Failed to roll back eval ${evalId}: ${e}. You may need to manually delete this eval.`,
    );
  }
}

async function sendChunkedResults(evalRecord: Eval, url: string): Promise<string | null> {
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

async function sendEvalResults(evalRecord: Eval, url: string): Promise<string | null> {
  await evalRecord.loadResults();
  logger.debug(`Sending eval results to ${url} with ${evalRecord.results.length} results`);

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
    throw new Error(`Failed to send eval results to ${url}: ${response.statusText}`);
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

async function handleLegacyResults(evalRecord: Eval, url: string): Promise<string | null> {
  logger.debug(`Using legacy results format for sharing to ${url}`);
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
    logger.error(
      `Failed to create shareable URL (${url}): ${response.statusText}. Check your API endpoint configuration.`,
    );
    return null;
  }

  const responseJson = (await response.json()) as { id?: string; error?: string };
  if (responseJson.error) {
    logger.error(
      `Failed to create shareable URL (${url}): ${responseJson.error}. Check your API endpoint configuration.`,
    );
    return null;
  }

  return responseJson.id ?? null;
}

/**
 * Constructs the shareable URL for an eval.
 * @param eval_ The eval to get the shareable URL for.
 * @param showAuth Whether to show the authentication information in the URL.
 * @returns The shareable URL for the eval.
 */
export async function getShareableUrl(
  eval_: Eval,
  showAuth: boolean = false,
): Promise<string | null> {
  const { domain } = determineShareDomain(eval_);

  // For custom self-hosted setups, ensure we're using the same domain as the API
  const customDomain = getEnvString('PROMPTFOO_REMOTE_APP_BASE_URL');
  const finalDomain = customDomain || domain;

  const fullUrl = cloudConfig.isEnabled()
    ? `${finalDomain}/eval/${eval_.id}`
    : SHARE_VIEW_BASE_URL === DEFAULT_SHARE_VIEW_BASE_URL && !customDomain
      ? `${finalDomain}/eval/${eval_.id}`
      : `${finalDomain}/eval/?evalId=${eval_.id}`;

  return showAuth ? fullUrl : stripAuthFromUrl(fullUrl);
}

/**
 * Shares an eval and returns the shareable URL.
 * @param evalRecord The eval to share.
 * @param showAuth Whether to show the authentication information in the URL.
 * @returns The shareable URL for the eval.
 */
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
  let evalId: string | null;
  if (!canUseNewResults || evalRecord.useOldResults()) {
    evalId = await handleLegacyResults(evalRecord, url);
  } else if (sendInChunks) {
    evalId = await sendChunkedResults(evalRecord, url);
  } else {
    evalId = await sendEvalResults(evalRecord, url);
  }

  if (!evalId) {
    return null;
  }
  logger.debug(`New eval ID on remote instance: ${evalId}`);

  return getShareableUrl(evalRecord, showAuth);
}

/**
 * Checks whether an eval has been shared.
 * @param eval_ The eval to check.
 * @returns True if the eval has been shared, false otherwise.
 */
export async function hasEvalBeenShared(eval_: Eval): Promise<boolean> {
  try {
    // GET /api/results/:id
    const res = await makeCloudRequest(`results/${eval_.id}`, 'GET');
    switch (res.status) {
      // 200: Eval already exists i.e. it has been shared before.
      case 200:
        return true;
      // 404: Eval not found i.e. it has not been shared before.
      case 404:
        return false;
      default:
        throw new Error(
          `[hasEvalBeenShared]: unexpected API error: ${res.status}\n${res.statusText}`,
        );
    }
  } catch (e) {
    logger.error(`[hasEvalBeenShared]: error checking if eval has been shared: ${e}`);
    return false;
  }
}
