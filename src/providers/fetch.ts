import { classifySdkRateLimit, fetchWithProxy } from '../util/fetch/index';

export function fetchWithProviderProxy(
  url: Parameters<typeof fetchWithProxy>[0],
  options?: Parameters<typeof fetchWithProxy>[1],
): ReturnType<typeof fetchWithProxy> {
  return fetchWithProxy(url, options);
}

export function classifyProviderSdkRateLimit(
  details: Parameters<typeof classifySdkRateLimit>[0],
): ReturnType<typeof classifySdkRateLimit> {
  return classifySdkRateLimit(details);
}
