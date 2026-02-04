/**
 * Provider wrapper that adds rate limiting to any ApiProvider.
 *
 * Use this to wrap providers before passing them to redteam/assertion
 * code paths that bypass the main evaluator.
 */

import { parseRetryAfter } from './headerParser';
import {
  getProviderResponseHeaders,
  isProviderResponseRateLimited,
  type RateLimitExecuteOptions,
} from './types';

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
 * Uses the specific WRAPPED_SYMBOL for type safety.
 */
type WrappedApiProvider = ApiProvider & { [WRAPPED_SYMBOL]: boolean };

/**
 * Check if a provider is already wrapped with rate limiting.
 */
export function isRateLimitWrapped(provider: ApiProvider): boolean {
  return (provider as WrappedApiProvider)[WRAPPED_SYMBOL] === true;
}

/**
 * Create rate limit detection options for ProviderResponse.
 * Shared between providerWrapper and evaluator for consistency.
 */
export function createProviderRateLimitOptions(): RateLimitExecuteOptions<ProviderResponse> {
  return {
    getHeaders: getProviderResponseHeaders,
    isRateLimited: isProviderResponseRateLimited,
    getRetryAfter: (result: ProviderResponse | undefined, error: Error | undefined) => {
      const rawHeaders = getProviderResponseHeaders(result);
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
  };
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
    // Explicitly delegate id() since prototype methods aren't copied by spread
    id: () => provider.id(),
    callApi: async (
      prompt: string,
      context?: CallApiContextParams,
      options?: CallApiOptionsParams,
    ): Promise<ProviderResponse> => {
      return registry.execute(
        provider,
        () => originalCallApi(prompt, context, options),
        createProviderRateLimitOptions(),
      );
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
