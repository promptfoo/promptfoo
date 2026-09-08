import { fetchWithProxy } from '../util/fetch/index';

export function fetchWithProviderProxy(
  url: Parameters<typeof fetchWithProxy>[0],
  options?: Parameters<typeof fetchWithProxy>[1],
): ReturnType<typeof fetchWithProxy> {
  return fetchWithProxy(url, options);
}
