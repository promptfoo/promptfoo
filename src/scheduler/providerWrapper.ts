/**
 * Provider wrapper that adds rate limiting to any ApiProvider.
 *
 * Use this to wrap providers before passing them to redteam/assertion
 * code paths that bypass the main evaluator.
 */

import { hasFunctionToolCallValidator } from '../contracts/providers';
import { parseRetryAfter } from './headerParser';
import {
  getProviderResponseHeaders,
  isProviderResponseRateLimited,
  type RateLimitExecuteOptions,
} from './types';

import type { ApiProvider, ProviderResponse } from '../types/providers';
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
export function createProviderRateLimitOptions<
  Result extends ProviderResponse = ProviderResponse,
>(): RateLimitExecuteOptions<Result> {
  return {
    // Provider errors are values carrying output, usage and HTTP metadata.
    // Keep that evidence when the scheduler has no retries left.
    onRateLimitExhausted: (result, error) =>
      result.error ? result : { ...result, error: error.message },
    // Non-retryable rate limits must not feed the shared
    // rate-limit state either: a billing 429 that also carries
    // `x-ratelimit-remaining-*: 0` and a reset timestamp would otherwise
    // park every queued and subsequent call until that reset instead of
    // letting them fail fast.
    getHeaders: (result: ProviderResponse | undefined) =>
      result?.metadata?.rateLimitRetryable === false || result?.metadata?.rateLimitKind === 'quota'
        ? undefined
        : getProviderResponseHeaders(result),
    isRateLimited: isProviderResponseRateLimited,
    getRetryAfter: (result: ProviderResponse | undefined, error: Error | undefined) => {
      if (result?.metadata?.rateLimitRetryable === false) {
        return undefined;
      }
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
  };
}

/**
 * Wrap a provider with rate limiting.
 *
 * The wrapped provider uses the registry for every supported operation,
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

  const wrapOperation = <Args extends unknown[], Result extends ProviderResponse>(
    operation: (...args: Args) => Promise<Result>,
  ) => {
    return (...args: Args): Promise<Result> =>
      registry.execute<Result>(
        provider,
        () => operation.apply(provider, args),
        createProviderRateLimitOptions<Result>(),
      );
  };

  const wrappedProvider: ApiProvider = {
    ...provider,
    promptfooCapabilities: provider.promptfooCapabilities,
    [Symbol.for('promptfoo.capabilityDelegate')]: provider,
    // Explicitly delegate id() since prototype methods aren't copied by spread
    id: () => provider.id(),
    config: provider.config,
    handlesOwnDelay: provider.handlesOwnDelay,
    handlesOwnRetries: provider.handlesOwnRetries,
    cleanup: provider.cleanup?.bind(provider),
    getSessionId: provider.getSessionId?.bind(provider),
    getAudioInputFormat: provider.getAudioInputFormat?.bind(provider),
    toJSON: provider.toJSON?.bind(provider),
    ...(hasFunctionToolCallValidator(provider) && {
      validateFunctionToolCall: provider.validateFunctionToolCall.bind(provider),
    }),
    callApi: wrapOperation(provider.callApi),
    callClassificationApi: provider.callClassificationApi
      ? wrapOperation(provider.callClassificationApi)
      : undefined,
    callEmbeddingApi: provider.callEmbeddingApi
      ? wrapOperation(provider.callEmbeddingApi)
      : undefined,
    callSimilarityApi: provider.callSimilarityApi
      ? wrapOperation(provider.callSimilarityApi)
      : undefined,
    callModerationApi: provider.callModerationApi
      ? wrapOperation(provider.callModerationApi)
      : undefined,
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
