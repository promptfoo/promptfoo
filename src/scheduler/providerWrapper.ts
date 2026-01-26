/**
 * Provider wrapper that adds rate limiting to any ApiProvider.
 *
 * Use this to wrap providers before passing them to redteam/assertion
 * code paths that bypass the main evaluator.
 */

import { parseRetryAfter } from './headerParser';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../types/providers';
import type { RateLimitRegistry } from './rateLimitRegistry';

/**
 * Symbol to mark providers that have already been wrapped.
 * Prevents double-wrapping which could cause issues.
 */
const WRAPPED_SYMBOL = Symbol.for('promptfoo.rateLimitWrapped');

/**
 * Type to represent a provider with the rate limit wrapper symbol.
 */
type WrappedApiProvider = ApiProvider & { [key: symbol]: boolean };

/**
 * Check if a provider is already wrapped with rate limiting.
 */
export function isRateLimitWrapped(provider: ApiProvider): boolean {
  return (provider as WrappedApiProvider)[WRAPPED_SYMBOL] === true;
}

/**
 * Wrap a provider with rate limiting.
 *
 * The wrapped provider will use the registry for all callApi calls,
 * automatically handling rate limits, retries, and adaptive concurrency.
 *
 * @param provider - The provider to wrap
 * @param registry - The rate limit registry to use
 * @returns A wrapped provider that applies rate limiting
 */
export function wrapProviderWithRateLimiting(
  provider: ApiProvider,
  registry: RateLimitRegistry,
): ApiProvider {
  // Don't double-wrap
  if (isRateLimitWrapped(provider)) {
    return provider;
  }

  const originalCallApi = provider.callApi.bind(provider);

  const wrappedProvider: ApiProvider = {
    ...provider,
    callApi: async (
      prompt: string,
      context?: CallApiContextParams,
      options?: CallApiOptionsParams,
    ): Promise<ProviderResponse> => {
      return registry.execute(provider, () => originalCallApi(prompt, context, options), {
        // Extract rate limit headers from response metadata
        // Headers are stored at metadata.http.headers per ProviderResponse type
        getHeaders: (result: ProviderResponse | undefined) =>
          (result?.metadata?.http?.headers || result?.metadata?.headers) as
            | Record<string, string>
            | undefined,
        // Detect rate limit from error message, status code, or error field
        isRateLimited: (result: ProviderResponse | undefined, error: Error | undefined) =>
          Boolean(
            // Check HTTP status code (most reliable)
            result?.metadata?.http?.status === 429 ||
              // Check error field in response
              result?.error?.includes?.('429') ||
              result?.error?.toLowerCase?.().includes?.('rate limit') ||
              // Check thrown error message
              error?.message?.includes('429') ||
              error?.message?.toLowerCase().includes('rate limit') ||
              error?.message?.toLowerCase().includes('too many requests'),
          ),
        // Extract retry-after from headers or error
        getRetryAfter: (result: ProviderResponse | undefined, error: Error | undefined) => {
          // Headers are stored at metadata.http.headers per ProviderResponse type
          const rawHeaders = (result?.metadata?.http?.headers || result?.metadata?.headers) as
            | Record<string, string>
            | undefined;
          if (rawHeaders) {
            // Normalize header keys to lowercase for consistent access
            const headers: Record<string, string> = {};
            for (const [key, value] of Object.entries(rawHeaders)) {
              headers[key.toLowerCase()] = value;
            }
            // Check retry-after-ms first (milliseconds)
            if (headers['retry-after-ms']) {
              const ms = parseInt(headers['retry-after-ms'], 10);
              if (!isNaN(ms) && ms >= 0) {
                return ms;
              }
            }
            // Check retry-after (uses robust parsing for seconds/HTTP-date)
            if (headers['retry-after']) {
              const parsed = parseRetryAfter(headers['retry-after']);
              if (parsed !== null) {
                return parsed;
              }
            }
          }
          // Try to extract from error message (some providers include it)
          const match = error?.message?.match(/\bretry after (\d+)\b/i);
          if (match) {
            return parseInt(match[1], 10) * 1000;
          }
          return undefined;
        },
      });
    },
  };

  // Mark as wrapped to prevent double-wrapping
  (wrappedProvider as WrappedApiProvider)[WRAPPED_SYMBOL] = true;

  return wrappedProvider;
}

/**
 * Wrap multiple providers with rate limiting.
 *
 * @param providers - The providers to wrap
 * @param registry - The rate limit registry to use
 * @returns Array of wrapped providers
 */
export function wrapProvidersWithRateLimiting(
  providers: ApiProvider[],
  registry: RateLimitRegistry,
): ApiProvider[] {
  return providers.map((provider) => wrapProviderWithRateLimiting(provider, registry));
}
