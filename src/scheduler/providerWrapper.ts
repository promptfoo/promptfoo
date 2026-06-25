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
  TokenUsage,
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

const TOKEN_USAGE_FIELDS = ['prompt', 'completion', 'cached', 'total'] as const;
const COMPLETION_DETAIL_FIELDS = [
  'reasoning',
  'acceptedPrediction',
  'rejectedPrediction',
  'cacheReadInputTokens',
  'cacheCreationInputTokens',
] as const;

function isSafeTokenMetric(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function addSafeTokenMetric(current: number | undefined, value: unknown): number | undefined {
  if (!isSafeTokenMetric(value)) {
    return undefined;
  }
  const total = (current ?? 0) + value;
  return Number.isSafeInteger(total) ? total : undefined;
}

function accumulateRetryTokenUsage(target: Partial<TokenUsage>, response: ProviderResponse): void {
  const usage = response.tokenUsage;
  for (const field of TOKEN_USAGE_FIELDS) {
    const total = addSafeTokenMetric(target[field], usage?.[field]);
    if (total !== undefined) {
      target[field] = total;
    }
  }

  for (const field of COMPLETION_DETAIL_FIELDS) {
    const value = usage?.completionDetails?.[field];
    const total = addSafeTokenMetric(target.completionDetails?.[field], value);
    if (total !== undefined) {
      target.completionDetails ??= {};
      target.completionDetails[field] = total;
    }
  }

  const requests = response.cached
    ? 0
    : isSafeTokenMetric(usage?.numRequests)
      ? usage.numRequests
      : 1;
  const totalRequests = addSafeTokenMetric(target.numRequests, requests);
  if (totalRequests !== undefined) {
    target.numRequests = totalRequests;
  }
}

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
          const ms = Number.parseInt(headers['retry-after-ms'], 10);
          if (Number.isFinite(ms) && ms >= 0) {
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
        const retryAfterMs = Number.parseInt(match[1], 10) * 1000;
        return Number.isFinite(retryAfterMs) ? retryAfterMs : undefined;
      }
      return undefined;
    },
    isRetryableResult: (result) => {
      return result.metadata?.retryableErrorKind === 'transient_availability';
    },
    finalizeResult: (result, retryResults) => {
      if (retryResults.length === 0) {
        return result;
      }
      const tokenUsage: Partial<TokenUsage> = {};
      let combinedCost = 0;
      let hasCost = false;
      let costOverflow = false;
      for (const response of [...retryResults, result]) {
        accumulateRetryTokenUsage(tokenUsage, response);
        if (
          typeof response.cost === 'number' &&
          Number.isFinite(response.cost) &&
          response.cost >= 0
        ) {
          combinedCost += response.cost;
          hasCost = true;
          costOverflow ||= !Number.isFinite(combinedCost);
        }
      }
      const resultWithoutCost = { ...result };
      delete resultWithoutCost.cost;
      return {
        ...resultWithoutCost,
        tokenUsage,
        ...(hasCost && !costOverflow && { cost: combinedCost }),
      };
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
