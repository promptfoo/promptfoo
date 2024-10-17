import fetch from 'node-fetch';
import type { RequestInfo, RequestInit, Response } from 'node-fetch';
import { ProxyAgent } from 'proxy-agent';
import invariant from 'tiny-invariant';
import { getEnvInt, getEnvBool } from './envars';
import logger from './logger';

export async function fetchWithProxy(
  url: RequestInfo,
  options: RequestInit = {},
): Promise<Response> {
  options.agent = new ProxyAgent({
    rejectUnauthorized: false, // Don't check SSL cert
  }) as unknown as RequestInit['agent'];
  return fetch(url, options);
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
      signal: signal as never, // AbortSignal type is not exported by node-fetch 2.x
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

function isRateLimited(response: Response): boolean {
  // These checks helps make sure we set up tests correctly.
  invariant(response.headers, 'Response headers are missing');
  invariant(response.status, 'Response status is missing');

  return response.headers.get('X-RateLimit-Remaining') === '0' || response.status === 429;
}

async function handleRateLimit(response: Response): Promise<void> {
  const rateLimitReset = response.headers.get('X-RateLimit-Reset');
  const retryAfter = response.headers.get('Retry-After');

  let waitTime = 60_000; // Default wait time of 60 seconds

  if (rateLimitReset) {
    const resetTime = new Date(Number.parseInt(rateLimitReset) * 1000);
    const now = new Date();
    waitTime = Math.max(resetTime.getTime() - now.getTime() + 1000, 0);
  } else if (retryAfter) {
    waitTime = Number.parseInt(retryAfter) * 1000;
  }

  await new Promise((resolve) => setTimeout(resolve, waitTime));
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
      lastError = error;
      const waitTime = Math.pow(2, i) * (backoff + 1000 * Math.random());
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
  throw new Error(`Request failed after ${retries} retries: ${(lastError as Error).message}`);
}
