import input from '@inquirer/input';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { URL } from 'url';
import { getShareApiBaseUrl, getDefaultShareViewBaseUrl, getShareViewBaseUrl } from './constants';
import { getEnvBool, getEnvInt, isCI, getEnvString } from './envars';
import { fetchWithProxy } from './fetch';
import { getUserEmail, setUserEmail } from './globalConfig/accounts';
import { cloudConfig } from './globalConfig/cloud';
import logger from './logger';
import type Eval from './models/eval';
import type EvalResult from './models/evalResult';
import { makeRequest as makeCloudRequest } from './util/cloud';

export interface ShareDomainResult {
  domain: string;
  isPublicShare: boolean;
}

export function isSharingEnabled(evalRecord: Eval): boolean {
  const sharingConfigOnEval =
    typeof evalRecord.config.sharing === 'object' ? evalRecord.config.sharing.apiBaseUrl : null;
  const sharingEnvUrl = getShareApiBaseUrl();

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
    ? envAppBaseUrl || getDefaultShareViewBaseUrl()
    : cloudConfig.isEnabled()
      ? cloudConfig.getAppUrl()
      : typeof sharing === 'object' && sharing.appBaseUrl
        ? sharing.appBaseUrl
        : envAppBaseUrl || getDefaultShareViewBaseUrl();

  logger.debug(`Share domain determined: domain=${domain}, isPublic=${isPublicShare}`);
  return { domain, isPublicShare };
}

// Helper functions
function getResultSize(result: any): number {
  return Buffer.byteLength(JSON.stringify(result), 'utf8');
}

function findLargestResultSize(results: any[], sampleSize: number = 1000): number {
  // Get the result size of the first sampleSize results
  const sampleSizes = results.slice(0, Math.min(sampleSize, results.length)).map(getResultSize);
  // find the largest result size
  const maxSize = Math.max(...sampleSizes);
  // return the largest result size
  return maxSize;
}

// This sends the eval record to the remote server
async function sendEvalRecord(
  evalRecord: Eval,
  url: string,
  headers: Record<string, string>,
): Promise<string> {
  const evalDataWithoutResults = { ...evalRecord, results: [] };
  logger.debug(`Sending initial eval data to ${url}`);
  const response = await fetchWithProxy(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(evalDataWithoutResults),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      `Failed to send initial eval data to ${url}: ${response.statusText}, body: ${responseBody}`,
    );
  }

  const responseJson = await response.json();
  if (!responseJson.id) {
    throw new Error(
      `Failed to send initial eval data to ${url}: ${response.statusText} ${responseJson}`,
    );
  }

  return responseJson.id;
}

async function sendChunkOfResults(
  chunk: any[],
  url: string,
  evalId: string,
  headers: Record<string, string>,
) {
  const targetUrl = `${url}/${evalId}/results`;
  logger.debug(`Sending chunk of ${chunk.length} results to ${targetUrl}`);
  const stringifiedChunk = JSON.stringify(chunk);
  const response = await fetchWithProxy(targetUrl, {
    method: 'POST',
    headers,
    body: stringifiedChunk,
  });

  if (!response.ok) {
    const responseBody = await response.text();
    logger.error(
      `Failed to send results chunk to ${targetUrl}: status code: ${response.status}, status text: ${response.statusText}, body: ${responseBody}`,
    );
    if (response.status === 413) {
      throw new Error(
        `Results chunk too large. It contained ${stringifiedChunk.length} bytes. Please reduce the number of results per chunk using the environment variable PROMPTFOO_SHARE_CHUNK_SIZE. Example: PROMPTFOO_SHARE_CHUNK_SIZE=100 promptfoo share`,
      );
    }
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
  const sampleResults = (await evalRecord.fetchResultsBatched(100).next()).value ?? [];
  if (sampleResults.length === 0) {
    logger.debug(`No results found`);
    return null;
  }
  logger.debug(`Loaded ${sampleResults.length} sample results to determine chunk size`);

  // Calculate chunk sizes based on sample
  const largestSize = findLargestResultSize(sampleResults);
  logger.debug(`Largest result size from sample: ${largestSize} bytes`);

  // Determine how many results per chunk
  const TARGET_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB in bytes
  const estimatedResultsPerChunk =
    getEnvInt('PROMPTFOO_SHARE_CHUNK_SIZE') ??
    Math.max(1, Math.floor(TARGET_CHUNK_SIZE / largestSize));

  logger.debug(`Estimated results per chunk: ${estimatedResultsPerChunk}`);

  // Prepare headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (cloudConfig.isEnabled()) {
    headers['Authorization'] = `Bearer ${cloudConfig.getApiKey()}`;
  }

  const totalResults = await evalRecord.getResultsCount();

  // Setup progress bar
  const progressBar = new cliProgress.SingleBar(
    {
      format: 'Sharing | {bar} | {percentage}% | {value}/{total} results',
    },
    cliProgress.Presets.shades_classic,
  );
  progressBar.start(totalResults, 0);

  let evalId: string | undefined;
  try {
    // Send initial data and get eval ID
    evalId = await sendEvalRecord(evalRecord, url, headers);
    logger.debug(`Initial eval data sent successfully - ${evalId}`);

    // Send chunks using batched cursor
    let currentChunk: EvalResult[] = [];
    for await (const batch of evalRecord.fetchResultsBatched(estimatedResultsPerChunk)) {
      for (const result of batch) {
        currentChunk.push(result);
        if (currentChunk.length >= estimatedResultsPerChunk) {
          await sendChunkOfResults(currentChunk, url, evalId, headers);
          progressBar.increment(currentChunk.length);
          currentChunk = [];
        }
      }
    }
    // Send final chunk
    if (currentChunk.length > 0) {
      await sendChunkOfResults(currentChunk, url, evalId, headers);
      progressBar.increment(currentChunk.length);
    }

    return evalId;
  } catch (e) {
    logger.error(`Upload failed: ${e instanceof Error ? e.message : String(e)}`);

    if (evalId) {
      logger.info(`Upload failed, rolling back...`);
      await rollbackEval(url, evalId, headers);
    }
    return null;
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
  url: string;
}> {
  if (cloudConfig.isEnabled()) {
    const apiBaseUrl = cloudConfig.getApiHost();
    return {
      url: `${apiBaseUrl}/api/v1/results`,
    };
  }

  const apiBaseUrl =
    typeof evalRecord.config.sharing === 'object'
      ? evalRecord.config.sharing.apiBaseUrl || getShareApiBaseUrl()
      : getShareApiBaseUrl();
  return {
    // This is going to a self-hosted instance so the api should match the Open Source API
    url: `${apiBaseUrl}/api/eval`,
  };
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
    : getShareViewBaseUrl() === getDefaultShareViewBaseUrl() && !customDomain
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
  const { url } = await getApiConfig(evalRecord);

  // 3. Determine if we can use new results format
  const canUseNewResults = cloudConfig.isEnabled();
  logger.debug(
    `Sharing with ${url} canUseNewResults: ${canUseNewResults} Use old results: ${evalRecord.useOldResults()}`,
  );

  const evalId = await sendChunkedResults(evalRecord, url);

  if (!evalId) {
    return null;
  }
  logger.debug(`New eval ID on remote instance: ${evalId}`);

  // Note: Eval ID will differ on self-hosted instance because self-hosted doesn't implement
  // sharing idempotency.
  if (evalId !== evalRecord.id) {
    evalRecord.id = evalId;
  }

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
