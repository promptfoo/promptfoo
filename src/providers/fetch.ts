import {
  classifySdkRateLimit,
  fetchWithProxy,
  rateLimitTimingFromHeaders,
} from '../util/fetch/index';

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

export function isProviderRateLimitTimingWithinRetryWindow(name: string, value: string): boolean {
  if (!name.startsWith('retry-after') && !name.includes('reset')) {
    return true;
  }
  const { retryAfterMs, resetAt } = rateLimitTimingFromHeaders({ [name]: value });
  // An upstream SDK should not stall the scheduler beyond its ordinary one-minute retry window.
  return (
    (retryAfterMs !== undefined || resetAt !== undefined) &&
    (retryAfterMs === undefined || retryAfterMs <= 60_000) &&
    (resetAt === undefined || resetAt - Date.now() <= 60_000)
  );
}
