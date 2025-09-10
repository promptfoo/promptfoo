import { URL } from 'url';

import input from '@inquirer/input';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { getDefaultShareViewBaseUrl, getShareApiBaseUrl, getShareViewBaseUrl } from './constants';
import { getEnvBool, getEnvInt, getEnvString, isCI } from './envars';
import { getUserEmail, setUserEmail } from './globalConfig/accounts';
import { cloudConfig } from './globalConfig/cloud';
import logger, { isDebugEnabled } from './logger';
import { checkCloudPermissions, makeRequest as makeCloudRequest } from './util/cloud';
import { fetchWithProxy } from './util/fetch';

import type Eval from './models/eval';
import type EvalResult from './models/evalResult';
import type ModelAudit from './models/modelAudit';

interface ShareDomainResult {
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

export function isModelAuditSharingEnabled(): boolean {
  // Model audit sharing uses the same configuration as eval sharing
  const sharingEnvUrl = getShareApiBaseUrl();
  const cloudSharingUrl = cloudConfig.isEnabled() ? cloudConfig.getApiHost() : null;

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
  logger.debug(
    `Sending initial eval data to ${url} - eval ${evalRecord.id} with ${evalRecord.prompts.length} prompts`,
  );

  const response = await fetchWithProxy(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(evalDataWithoutResults),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    // Ensure full error is visible by formatting it properly
    const errorMessage = `Failed to send initial eval data to ${url}: ${response.statusText}`;
    const bodyMessage = responseBody ? `\nResponse body: ${responseBody}` : '';
    throw new Error(`${errorMessage}${bodyMessage}`);
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
  const stringifiedChunk = JSON.stringify(chunk);
  const chunkSizeBytes = Buffer.byteLength(stringifiedChunk, 'utf8');

  logger.debug(`Sending chunk of ${chunk.length} results to ${targetUrl}`);
  logger.debug(`Chunk size: ${(chunkSizeBytes / 1024 / 1024).toFixed(2)} MB`);

  const response = await fetchWithProxy(targetUrl, {
    method: 'POST',
    headers,
    body: stringifiedChunk,
  });

  if (!response.ok) {
    const responseBody = await response.text();
    const debugInfo = {
      url: targetUrl,
      statusCode: response.status,
      statusText: response.statusText,
      chunkSize: chunk.length,
      chunkSizeBytes,
      chunkSizeMB: (chunkSizeBytes / 1024 / 1024).toFixed(2),
      headers: Object.keys(headers),
      evalId,
      responseBody: responseBody.length > 500 ? `${responseBody.slice(0, 500)}...` : responseBody,
    };

    logger.error(
      `Failed to send results chunk to ${targetUrl}: status code: ${response.status}, status text: ${response.statusText}, body: ${responseBody}`,
    );
    logger.error(`Debug info: ${JSON.stringify(debugInfo, null, 2)}`);

    if (response.status === 413) {
      throw new Error(
        `Results chunk too large. It contained ${stringifiedChunk.length} bytes (${(chunkSizeBytes / 1024 / 1024).toFixed(2)} MB). Please reduce the number of results per chunk using the environment variable PROMPTFOO_SHARE_CHUNK_SIZE. Example: PROMPTFOO_SHARE_CHUNK_SIZE=10 promptfoo share`,
      );
    }
    throw new Error(
      `Failed to send results chunk to ${targetUrl}. Status: ${response.status} ${response.statusText}. Chunk size: ${chunk.length} results (${(chunkSizeBytes / 1024 / 1024).toFixed(2)} MB). See debug logs for more details.`,
    );
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
  const isVerbose = isDebugEnabled();
  logger.debug(`Starting chunked results upload to ${url}`);

  await checkCloudPermissions(evalRecord.config);

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
  const TARGET_CHUNK_SIZE = 0.9 * 1024 * 1024; // 900KB in bytes
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
  logger.debug(`Total results to share: ${totalResults}`);

  // Setup progress bar only if not in verbose mode or CI
  let progressBar: cliProgress.SingleBar | null = null;
  if (!isVerbose && !isCI()) {
    progressBar = new cliProgress.SingleBar(
      {
        format: 'Sharing | {bar} | {percentage}% | {value}/{total} results',
        gracefulExit: true,
      },
      cliProgress.Presets.shades_classic,
    );
    progressBar.start(totalResults, 0);
  }

  let evalId: string | undefined;
  try {
    // Send initial data and get eval ID
    evalId = await sendEvalRecord(evalRecord, url, headers);
    logger.debug(`Initial eval data sent successfully - ${evalId}`);

    // Send chunks using batched cursor
    let currentChunk: EvalResult[] = [];
    let totalSent = 0;
    let chunkNumber = 0;

    for await (const batch of evalRecord.fetchResultsBatched(estimatedResultsPerChunk)) {
      for (const result of batch) {
        currentChunk.push(result);
        if (currentChunk.length >= estimatedResultsPerChunk) {
          chunkNumber++;
          logger.debug(`Sending chunk ${chunkNumber} with ${currentChunk.length} results`);

          await sendChunkOfResults(currentChunk, url, evalId, headers);
          totalSent += currentChunk.length;

          if (progressBar) {
            progressBar.increment(currentChunk.length);
          } else {
            logger.info(
              `Progress: ${totalSent}/${totalResults} results shared (${Math.round((totalSent / totalResults) * 100)}%)`,
            );
          }

          currentChunk = [];
        }
      }
    }

    // Send final chunk
    if (currentChunk.length > 0) {
      chunkNumber++;
      logger.debug(`Sending final chunk ${chunkNumber} with ${currentChunk.length} results`);

      await sendChunkOfResults(currentChunk, url, evalId, headers);
      totalSent += currentChunk.length;

      if (progressBar) {
        progressBar.increment(currentChunk.length);
      } else {
        logger.info(`Progress: ${totalSent}/${totalResults} results shared (100%)`);
      }
    }

    logger.debug(
      `Sharing complete. Total chunks sent: ${chunkNumber}, Total results: ${totalSent}`,
    );

    return evalId;
  } catch (e) {
    if (progressBar) {
      progressBar.stop();
    }

    logger.error(`Upload failed: ${e instanceof Error ? e.message : String(e)}`);

    if (evalId) {
      logger.info(`Upload failed, rolling back...`);
      await rollbackEval(url, evalId, headers);
    }
    return null;
  } finally {
    if (progressBar) {
      progressBar.stop();
    }
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
  remoteEvalId: string,
  showAuth: boolean = false,
): Promise<string | null> {
  const { domain } = determineShareDomain(eval_);

  // For custom self-hosted setups, ensure we're using the same domain as the API
  const customDomain = getEnvString('PROMPTFOO_REMOTE_APP_BASE_URL');
  const finalDomain = customDomain || domain;

  const fullUrl = cloudConfig.isEnabled()
    ? `${finalDomain}/eval/${remoteEvalId}`
    : getShareViewBaseUrl() === getDefaultShareViewBaseUrl() && !customDomain
      ? `${finalDomain}/eval/${remoteEvalId}`
      : `${finalDomain}/eval/?evalId=${remoteEvalId}`;

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
  // If sharing is explicitly disabled, return null
  if (getEnvBool('PROMPTFOO_DISABLE_SHARING')) {
    logger.debug('Sharing is explicitly disabled, returning null');
    return null;
  }

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

  return getShareableUrl(evalRecord, evalId, showAuth);
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

/**
 * Checks whether a model audit has been shared.
 * @param audit The model audit to check.
 * @returns True if the model audit has been shared, false otherwise.
 */
export async function hasModelAuditBeenShared(audit: ModelAudit): Promise<boolean> {
  try {
    // GET /api/v1/model-audits/:id
    const res = await makeCloudRequest(`model-audits/${audit.id}`, 'GET');
    switch (res.status) {
      // 200: Model audit already exists i.e. it has been shared before.
      case 200:
        return true;
      // 404: Model audit not found i.e. it has not been shared before.
      case 404:
        return false;
      default:
        throw new Error(
          `[hasModelAuditBeenShared]: unexpected API error: ${res.status}\n${res.statusText}`,
        );
    }
  } catch (e) {
    logger.error(`[hasModelAuditBeenShared]: error checking if model audit has been shared: ${e}`);
    return false;
  }
}

/**
 * Creates a shareable URL for a model audit.
 * @param auditRecord The model audit to share.
 * @param showAuth Whether to show the authentication information in the URL.
 * @returns The shareable URL for the model audit.
 */
export async function createShareableModelAuditUrl(
  auditRecord: ModelAudit,
  showAuth: boolean = false,
): Promise<string | null> {
  // 1. Handle email collection (skip for model audits as they don't have eval config)
  // Model audits use cloud config directly

  // 2. Get API configuration
  const apiBaseUrl = cloudConfig.isEnabled() ? cloudConfig.getApiHost() : getShareApiBaseUrl();

  const headers = {
    'Content-Type': 'application/json',
    ...(cloudConfig.isEnabled() && { Authorization: `Bearer ${cloudConfig.getApiKey()}` }),
  };

  const url = `${apiBaseUrl}/api/v1/model-audits/share`;

  // 3. Send the model audit data
  logger.debug(`Sharing model audit ${auditRecord.id} to ${url}`);

  try {
    const payload = {
      scanId: auditRecord.id,
      createdAt: auditRecord.createdAt,
      updatedAt: auditRecord.updatedAt,
      name: auditRecord.name,
      author: auditRecord.author,
      modelPath: auditRecord.modelPath,
      modelType: auditRecord.modelType,
      results: auditRecord.results,
      checks: auditRecord.checks,
      issues: auditRecord.issues,
      hasErrors: auditRecord.hasErrors,
      totalChecks: auditRecord.totalChecks,
      passedChecks: auditRecord.passedChecks,
      failedChecks: auditRecord.failedChecks,
      metadata: auditRecord.metadata,
    };

    // Log payload size for debugging large model audits
    const payloadSize = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    logger.debug(`Model audit payload size: ${(payloadSize / 1024 / 1024).toFixed(2)} MB`);

    const response = await fetchWithProxy(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(
        `Failed to share model audit: ${response.status} ${response.statusText}\n${responseBody}`,
      );
    }

    const { remoteId } = await response.json();
    logger.debug(`Model audit shared successfully. Remote ID: ${remoteId}`);

    return getShareableModelAuditUrl(auditRecord, remoteId || auditRecord.id, showAuth);
  } catch (error) {
    logger.error(
      `Error sharing model audit: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Gets the shareable URL for a model audit.
 * @param audit The model audit.
 * @param remoteAuditId The remote ID of the model audit.
 * @param showAuth Whether to show the authentication information in the URL.
 * @returns The shareable URL for the model audit.
 */
export function getShareableModelAuditUrl(
  audit: ModelAudit,
  remoteAuditId: string,
  showAuth: boolean = false,
): string {
  const appBaseUrl = cloudConfig.isEnabled()
    ? cloudConfig.getAppUrl()
    : getShareViewBaseUrl() || getDefaultShareViewBaseUrl();

  const fullUrl = `${appBaseUrl}/model-audit/scan/${remoteAuditId}`;

  return showAuth ? fullUrl : stripAuthFromUrl(fullUrl);
}
