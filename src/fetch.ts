import { ProxyAgent } from 'proxy-agent';
import { VERSION } from './constants';
import { getEnvInt, getEnvBool } from './envars';
import logger from './logger';
import invariant from './util/invariant';
import { sleep } from './util/time';

export async function fetchWithProxy(
  url: RequestInfo,
  options: RequestInit = {},
): Promise<Response> {
  let finalUrl = url;

  const finalOptions = {
    ...options,
    headers: {
      ...options.headers,
      'x-promptfoo-version': VERSION,
    } as Record<string, string>,
  };

  if (typeof url === 'string') {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.username || parsedUrl.password) {
        if (finalOptions.headers && 'Authorization' in finalOptions.headers) {
          logger.warn(
            'Both URL credentials and Authorization header present - URL credentials will be ignored',
          );
        } else {
          // Move credentials to Authorization header
          const username = parsedUrl.username || '';
          const password = parsedUrl.password || '';
          const credentials = Buffer.from(`${username}:${password}`).toString('base64');
          finalOptions.headers = {
            ...finalOptions.headers,
            Authorization: `Basic ${credentials}`,
          };
        }
        parsedUrl.username = '';
        parsedUrl.password = '';
        finalUrl = parsedUrl.toString();
      }
    } catch (e) {
      logger.debug(`URL parsing failed in fetchWithProxy: ${e}`);
    }
  }

  const agent = new ProxyAgent({
    rejectUnauthorized: false,
  });

  return fetch(finalUrl, { ...finalOptions, agent } as RequestInit);
}

export function fetchWithTimeout(
  url: RequestInfo,
  options: RequestInit = {},
  timeout: number,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const { signal } = controller;
    const timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Request timed out after ${timeout} ms`));
    }, timeout);

    fetchWithProxy(url, {
      ...options,
      signal,
    })
      .then((response) => {
        clearTimeout(timeoutId);
        resolve(response);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export function isRateLimited(response: Response): boolean {
  // These checks helps make sure we set up tests correctly.
  invariant(response.headers, 'Response headers are missing');
  invariant(response.status, 'Response status is missing');

  // Check for OpenAI specific rate limit headers and status codes
  return (
    response.headers.get('X-RateLimit-Remaining') === '0' ||
    response.status === 429 ||
    // OpenAI specific error codes
    response.headers.get('x-ratelimit-remaining-requests') === '0' ||
    response.headers.get('x-ratelimit-remaining-tokens') === '0'
  );
}

export async function handleRateLimit(response: Response): Promise<void> {
  const rateLimitReset = response.headers.get('X-RateLimit-Reset');
  const retryAfter = response.headers.get('Retry-After');
  // OpenAI specific headers
  const openaiReset =
    response.headers.get('x-ratelimit-reset-requests') ||
    response.headers.get('x-ratelimit-reset-tokens');

  let waitTime = 60_000; // Default wait time of 60 seconds

  if (openaiReset) {
    waitTime = Math.max(Number.parseInt(openaiReset) * 1000, 0);
  } else if (rateLimitReset) {
    const resetTime = new Date(Number.parseInt(rateLimitReset) * 1000);
    const now = new Date();
    waitTime = Math.max(resetTime.getTime() - now.getTime() + 1000, 0);
  } else if (retryAfter) {
    waitTime = Number.parseInt(retryAfter) * 1000;
  }

  logger.debug(`Rate limited, waiting ${waitTime}ms before retry`);
  await sleep(waitTime);
}

export async function fetchWithRetries(
  url: RequestInfo,
  options: RequestInit = {},
  timeout: number,
  retries: number = 4,
): Promise<Response> {
  let lastError;
  const backoff = getEnvInt('PROMPTFOO_REQUEST_BACKOFF_MS', 5000);

  for (let i = 0; i < retries; i++) {
    let response;
    try {
      response = await fetchWithTimeout(url, options, timeout);

      if (getEnvBool('PROMPTFOO_RETRY_5XX') && response.status >= 500 && response.status < 600) {
        throw new Error(`Internal Server Error: ${response.status} ${response.statusText}`);
      }

      if (response && isRateLimited(response)) {
        logger.debug(
          `Rate limited on URL ${url}: ${response.status} ${response.statusText}, waiting before retry ${i + 1}/${retries}`,
        );
        await handleRateLimit(response);
        continue;
      }

      return response;
    } catch (error) {
      let errorMessage;
      if (error instanceof Error) {
        // Extract as much detail as possible from the error
        errorMessage = `${error.name}: ${error.message}`;
        if ('cause' in error) {
          errorMessage += ` (Cause: ${error.cause})`;
        }
        if ('code' in error) {
          // Node.js system errors often have error codes
          errorMessage += ` (Code: ${error.code})`;
        }
      } else {
        errorMessage = String(error);
      }

      logger.debug(`Request to ${url} failed (attempt #${i + 1}), retrying: ${errorMessage}`);
      lastError = error;
      const waitTime = Math.pow(2, i) * (backoff + 1000 * Math.random());
      await sleep(waitTime);
    }
  }
  throw new Error(`Request failed after ${retries} retries: ${(lastError as Error).message}`);
}
