import { fetchWithRetries } from '../util/fetch/index';

/**
 * Keep provider retrying requests behind a single provider-to-Node boundary.
 */
export async function fetchProviderRequestWithRetries(
  url: RequestInfo,
  options: RequestInit,
  timeout: number,
  maxRetries?: number,
): Promise<Response> {
  return fetchWithRetries(url, options, timeout, maxRetries);
}
