import logger from '../logger';
import type { ApiProvider } from '../types/providers';
import type { TokenUsage } from '../types/shared';

/**
 * A utility class for tracking token usage across an evaluation
 */
export class TokenUsageTracker {
  private static instance: TokenUsageTracker;
  private providersMap: Map<string, TokenUsage> = new Map();

  private constructor() {}

  /**
   * Get the singleton instance of TokenUsageTracker
   */
  public static getInstance(): TokenUsageTracker {
    if (!TokenUsageTracker.instance) {
      TokenUsageTracker.instance = new TokenUsageTracker();
    }
    return TokenUsageTracker.instance;
  }

  /**
   * Track token usage for a provider
   * @param provider The provider to track usage for
   * @param usage The token usage to track
   */
  public trackUsage(providerId: string, usage?: TokenUsage): void {
    if (!usage) {
      return;
    }

    const current =
      this.providersMap.get(providerId) ??
      ({
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
        completionDetails: { reasoning: 0, acceptedPrediction: 0, rejectedPrediction: 0 },
        assertions: { total: 0, prompt: 0, completion: 0, cached: 0 },
      } satisfies TokenUsage);
    this.providersMap.set(providerId, this.mergeUsage(current, usage));
    logger.debug(
      `Tracked token usage for ${providerId}: total=${usage.total ?? 0}, cached=${usage.cached ?? 0}`,
    );
  }

  /**
   * Get the cumulative token usage for a specific provider
   * @param providerId The ID of the provider to get usage for
   * @returns The token usage for the provider
   */
  public getProviderUsage(providerId: string): TokenUsage | undefined {
    return this.providersMap.get(providerId);
  }

  /**
   * Get all provider IDs that have token usage tracked
   * @returns Array of provider IDs
   */
  public getProviderIds(): string[] {
    return Array.from(this.providersMap.keys());
  }

  /**
   * Get aggregated token usage across all providers
   * @returns Aggregated token usage
   */
  public getTotalUsage(): TokenUsage {
    const result: TokenUsage = {
      total: 0,
      prompt: 0,
      completion: 0,
      cached: 0,
      numRequests: 0,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
      assertions: {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
      },
    };

    // Accumulate totals from all providers
    for (const usage of this.providersMap.values()) {
      result.total! += usage.total ?? 0;
      result.prompt! += usage.prompt ?? 0;
      result.completion! += usage.completion ?? 0;
      result.cached! += usage.cached ?? 0;
      result.numRequests! += usage.numRequests ?? 0;

      // Add completion details
      if (usage.completionDetails) {
        result.completionDetails!.reasoning! += usage.completionDetails.reasoning ?? 0;
        result.completionDetails!.acceptedPrediction! +=
          usage.completionDetails.acceptedPrediction ?? 0;
        result.completionDetails!.rejectedPrediction! +=
          usage.completionDetails.rejectedPrediction ?? 0;
      }

      // Add assertion statistics
      if (usage.assertions) {
        result.assertions!.total! += usage.assertions.total ?? 0;
        result.assertions!.prompt! += usage.assertions.prompt ?? 0;
        result.assertions!.completion! += usage.assertions.completion ?? 0;
        result.assertions!.cached! += usage.assertions.cached ?? 0;
      }
    }

    return result;
  }

  /**
   * Reset token usage for a specific provider
   * @param providerId The ID of the provider to reset
   */
  public resetProviderUsage(providerId: string): void {
    this.providersMap.delete(providerId);
  }

  /**
   * Reset token usage for all providers
   */
  public resetAllUsage(): void {
    this.providersMap.clear();
  }

  /**
   * Cleanup method to prevent memory leaks
   */
  public cleanup(): void {
    this.providersMap.clear();
  }

  /**
   * Merge token usage records
   * @param current The current token usage
   * @param update The new token usage to merge
   * @returns The merged token usage
   */
  private mergeUsage(current: TokenUsage, update: TokenUsage): TokenUsage {
    // Create a result object with all properties initialized
    const result: TokenUsage = {
      prompt: (current.prompt ?? 0) + (update.prompt ?? 0),
      completion: (current.completion ?? 0) + (update.completion ?? 0),
      cached: (current.cached ?? 0) + (update.cached ?? 0),
      total: (current.total ?? 0) + (update.total ?? 0),
      numRequests: (current.numRequests ?? 0) + (update.numRequests ?? 0),
      completionDetails: {
        reasoning:
          (current.completionDetails?.reasoning ?? 0) + (update.completionDetails?.reasoning ?? 0),
        acceptedPrediction:
          (current.completionDetails?.acceptedPrediction ?? 0) +
          (update.completionDetails?.acceptedPrediction ?? 0),
        rejectedPrediction:
          (current.completionDetails?.rejectedPrediction ?? 0) +
          (update.completionDetails?.rejectedPrediction ?? 0),
      },
      assertions: {
        total: (current.assertions?.total ?? 0) + (update.assertions?.total ?? 0),
        prompt: (current.assertions?.prompt ?? 0) + (update.assertions?.prompt ?? 0),
        completion: (current.assertions?.completion ?? 0) + (update.assertions?.completion ?? 0),
        cached: (current.assertions?.cached ?? 0) + (update.assertions?.cached ?? 0),
      },
    };

    return result;
  }
}

/**
 * Decorator function to wrap a provider's callApi method to track token usage
 * @param provider The provider to instrument
 * @returns The instrumented provider
 */
export function withTokenTracking<T extends ApiProvider>(provider: T): T {
  const originalCallApi = provider.callApi;

  provider.callApi = async (...args) => {
    const response = await originalCallApi.apply(provider, args);
    if (response.tokenUsage) {
      const providerId = provider.id();
      // Include the provider's class in the tracking ID
      const trackingId = provider.constructor?.name
        ? `${providerId} (${provider.constructor.name})`
        : providerId;

      TokenUsageTracker.getInstance().trackUsage(trackingId, response.tokenUsage);
    }
    return response;
  };

  return provider;
}

/**
 * Get the cumulative token usage from a provider
 * @param provider The provider to get token usage from
 * @returns The cumulative token usage
 */
export function getCumulativeTokenUsage(provider: ApiProvider): TokenUsage | undefined {
  return TokenUsageTracker.getInstance().getProviderUsage(provider.id());
}

/**
 * Reset the cumulative token usage for a provider
 * @param provider The provider to reset token usage for
 */
export function resetCumulativeTokenUsage(provider: ApiProvider): void {
  TokenUsageTracker.getInstance().resetProviderUsage(provider.id());
}

/**
 * Get the total token usage across all providers
 * @returns The total token usage
 */
export function getTotalTokenUsage(): TokenUsage {
  return TokenUsageTracker.getInstance().getTotalUsage();
}

/**
 * Reset token usage for all providers
 */
export function resetAllProviderTokenUsage(): void {
  TokenUsageTracker.getInstance().resetAllUsage();
}
