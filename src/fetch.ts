import fetch from 'node-fetch';
import { ProxyAgent } from 'proxy-agent';

import type { RequestInfo, RequestInit, Response } from 'node-fetch';

export async function fetchCsvFromGoogleSheet(url: string): Promise<string> {
  const csvUrl = url.replace(/\/edit.*$/, '/export?format=csv');
  const response = await fetchWithProxy(csvUrl);
  if (response.status !== 200) {
    throw new Error(`Failed to fetch CSV from Google Sheets URL: ${url}`);
  }
  const csvData = await response.text();
  return csvData;
}

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
    options.signal = signal;

    const timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Request timed out after ${timeout} ms`));
    }, timeout);

    fetchWithProxy(url, options)
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
      return await fetchWithTimeout(url, options, timeout);
    } catch (error) {
      lastError = error;
      const waitTime = Math.pow(2, i) * (backoff + 1000 * Math.random());
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
  throw new Error(`Request failed after ${retries} retries: ${(lastError as Error).message}`);
}
