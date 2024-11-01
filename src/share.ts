import input from '@inquirer/input';
import chalk from 'chalk';
import { SingleBar, Presets } from 'cli-progress';
import { URL } from 'url';
import { SHARE_API_BASE_URL, SHARE_VIEW_BASE_URL, DEFAULT_SHARE_VIEW_BASE_URL } from './constants';
import { getEnvBool, isCI } from './envars';
import { fetchWithProxy } from './fetch';
import { getAuthor } from './globalConfig/accounts';
import { getUserEmail, setUserEmail } from './globalConfig/accounts';
import { cloudConfig } from './globalConfig/cloud';
import logger from './logger';
import type Eval from './models/eval';
import type { SharedResults } from './types';

const UPLOAD_CONFIG = {
  STREAMING_THRESHOLD: 5 * 1024 * 1024, // 5MB
  BATCH_SIZE: 50,
  VERSION: 3,
} as const;

type StreamChunk = {
  type: 'metadata' | 'results';
  batch?: number;
  totalBatches?: number;
  data?: unknown[];
  config?: unknown;
  createdAt?: string | number;
  totalResults?: number;
  version: number;
  author?: string | null;
};

async function* generateResultsStream(evalRecord: Eval, onProgress?: (progress: number) => void) {
  // Convert createdAt to string if it's a number
  const metadata: StreamChunk = {
    type: 'metadata',
    config: evalRecord.config,
    createdAt: evalRecord.createdAt?.toString(),
    totalResults: evalRecord.results.length,
    version: UPLOAD_CONFIG.VERSION,
    author: getAuthor() || undefined,
  };
  yield JSON.stringify(metadata) + '\n';

  const totalBatches = Math.ceil(evalRecord.results.length / UPLOAD_CONFIG.BATCH_SIZE);
  for (let i = 0; i < evalRecord.results.length; i += UPLOAD_CONFIG.BATCH_SIZE) {
    const batchIndex = Math.floor(i / UPLOAD_CONFIG.BATCH_SIZE);
    const batch = evalRecord.results.slice(i, i + UPLOAD_CONFIG.BATCH_SIZE);

    const chunk: StreamChunk = {
      type: 'results',
      batch: batchIndex,
      totalBatches,
      data: batch,
      version: UPLOAD_CONFIG.VERSION,
    };
    yield JSON.stringify(chunk) + '\n';

    onProgress?.((batchIndex + 1) / totalBatches);
    await new Promise((resolve) => setImmediate(resolve));
  }
}

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

// Move helper functions above where they're used
async function validateResponse(response: Response): Promise<void> {
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Failed to send eval results: ${response.statusText} (${errorText})`);
  }
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (cloudConfig.isEnabled()) {
    headers['Authorization'] = `Bearer ${cloudConfig.getApiKey()}`;
  }
  return headers;
}

async function sendStreamingResults(evalRecord: Eval, url: string): Promise<string> {
  let progressBar: SingleBar | undefined;

  try {
    const headers = getHeaders();
    headers['X-Upload-Mode'] = 'streaming';
    headers['Transfer-Encoding'] = 'chunked';

    if (logger.level !== 'debug') {
      progressBar = new SingleBar(
        {
          format: 'Uploading results {bar} {percentage}% | ETA: {eta}s | {value}/{total} batches',
          hideCursor: true,
        },
        Presets.shades_classic,
      );

      const totalBatches = Math.ceil(evalRecord.results.length / UPLOAD_CONFIG.BATCH_SIZE);
      progressBar.start(totalBatches, 0);
    }

    // Type assertion for fetch options to include duplex
    const fetchOptions: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers,
      body: new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of generateResultsStream(evalRecord, (progress) => {
              if (progressBar) {
                progressBar.update(Math.floor(progress * progressBar.getTotal()));
              }
            })) {
              controller.enqueue(new TextEncoder().encode(chunk));
            }
            controller.close();
          } catch (error) {
            controller.error(error);
          } finally {
            if (progressBar) {
              progressBar.stop();
            }
          }
        },
      }),
      duplex: 'half',
    };

    const response = await fetchWithProxy(url, fetchOptions);
    await validateResponse(response);
    const { id: evalId } = await response.json();
    return evalId;
  } catch (error) {
    logger.error('Failed to send streaming results:', error);
    throw error;
  } finally {
    if (progressBar) {
      progressBar.stop();
    }
  }
}

async function sendEvalResults(evalRecord: Eval, url: string): Promise<string | undefined> {
  try {
    const payloadSize = JSON.stringify(evalRecord.results).length;
    if (payloadSize > UPLOAD_CONFIG.STREAMING_THRESHOLD) {
      return await sendStreamingResults(evalRecord, url);
    } else {
      const headers = getHeaders();
      const response = await fetchWithProxy(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(evalRecord),
      });

      await validateResponse(response);
      const { id: evalId } = await response.json();
      return evalId;
    }
  } catch (error) {
    logger.error('Failed to send eval results:', error);
    return undefined;
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
  try {
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
    let apiBaseUrl: string;
    let url: string;
    if (cloudConfig.isEnabled()) {
      apiBaseUrl = cloudConfig.getApiHost();
      url = `${apiBaseUrl}/results`;
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
      if (!evalId) {
        return null;
      }
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
  } catch (error) {
    logger.error('Failed to create shareable URL:', error);
    return null;
  }
}
