import { fetchWithProxy, fetchWithRetries, readBoundedText } from '../util/fetch/index';

export function fetchWithProviderProxy(
  url: Parameters<typeof fetchWithProxy>[0],
  options?: Parameters<typeof fetchWithProxy>[1],
): ReturnType<typeof fetchWithProxy> {
  return fetchWithProxy(url, options);
}

export function fetchProviderRequestWithRetries(
  ...args: Parameters<typeof fetchWithRetries>
): ReturnType<typeof fetchWithRetries> {
  return fetchWithRetries(...args);
}

export function readProviderErrorText(response: Response): Promise<string> {
  return readBoundedText(response, 64 * 1024, { requireStream: true });
}
