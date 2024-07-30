import fetch from 'node-fetch';
import type { RequestInfo, RequestInit, Response } from 'node-fetch';
import { ProxyAgent } from 'proxy-agent';
import invariant from 'tiny-invariant';
import logger from './logger';

export async function fetchWithProxy(
  url: RequestInfo,
  options: RequestInit = {},
): Promise<Response> {
  options.agent = new ProxyAgent() as unknown as RequestInit['agent'];
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
  // This check helps make sure we set up tests correctly.
  invariant(response.headers, 'Response headers are missing');

  return response.headers.get('X-RateLimit-Remaining') === '0';
}

async function handleRateLimit(response: Response): Promise<void> {
  const rateLimitReset = response.headers.get('X-RateLimit-Reset');
  if (rateLimitReset) {
    const resetTime = new Date(parseInt(rateLimitReset) * 1000);
    const now = new Date();
    const waitTime = Math.max(resetTime.getTime() - now.getTime() + 1000, 0);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  } else {
    // If no reset time is provided, wait for a default time
    await new Promise((resolve) => setTimeout(resolve, 60_000));
  }
}

export async function fetchWithRetries(
  url: RequestInfo,
  options: RequestInit = {},
  timeout: number,
  retries: number = 4,
): Promise<Response> {
  let lastError;
  const backoff = process.env.PROMPTFOO_REQUEST_BACKOFF_MS
    ? parseInt(process.env.PROMPTFOO_REQUEST_BACKOFF_MS, 10)
    : 5000;

  for (let i = 0; i < retries; i++) {
    let response;
    try {
      response = await fetchWithTimeout(url, options, timeout);

      if (process.env.PROMPTFOO_RETRY_5XX && response.status >= 500 && response.status < 600) {
        throw new Error(`Internal Server Error: ${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error) {
      lastError = error;
      const waitTime = Math.pow(2, i) * (backoff + 1000 * Math.random());
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    if (response && isRateLimited(response)) {
      logger.debug(
        `Rate limited on URL ${url}: ${response.status} ${response.statusText}, waiting before retry ${i + 1}/${retries}`,
      );
      await handleRateLimit(response);
      continue;
    }
  }
  throw new Error(`Request failed after ${retries} retries: ${(lastError as Error).message}`);
}
