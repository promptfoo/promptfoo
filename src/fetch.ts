import fetch from 'node-fetch';
import type { RequestInfo, RequestInit, Response } from 'node-fetch';
import { ProxyAgent } from 'proxy-agent';

export async function fetchWithProxy(
  url: RequestInfo,
  options: RequestInit = {},
): Promise<Response> {
  options.agent = new ProxyAgent();
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
    try {
      const response = await fetchWithTimeout(url, options, timeout);
      if (process.env.PROMPTFOO_RETRY_5XX && response.status / 100 === 5) {
        throw new Error(`Internal Server Error: ${response.status} ${response.statusText}`);
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
