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

    const current = this.providersMap.get(providerId) || {};
    this.providersMap.set(providerId, this.mergeUsage(current, usage));
    logger.debug(
      `Tracked token usage for ${providerId}: total=${usage.total || 0}, cached=${usage.cached || 0}`,
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
    // Create a new result object with all properties explicitly initialized
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

    // Explicitly accumulate totals from all providers
    for (const usage of this.providersMap.values()) {
      // Add token counts with safe, non-mutating assignments
      if (result.total !== undefined) {
        result.total += typeof usage.total === 'number' ? usage.total : 0;
      }
      if (result.prompt !== undefined) {
        result.prompt += typeof usage.prompt === 'number' ? usage.prompt : 0;
      }
      if (result.completion !== undefined) {
        result.completion += typeof usage.completion === 'number' ? usage.completion : 0;
      }
      if (result.cached !== undefined) {
        result.cached += typeof usage.cached === 'number' ? usage.cached : 0;
      }
      if (result.numRequests !== undefined) {
        result.numRequests += typeof usage.numRequests === 'number' ? usage.numRequests : 0;
      }

      // Add completion details with safe assignments
      if (usage.completionDetails && result.completionDetails) {
        if (result.completionDetails.reasoning !== undefined) {
          result.completionDetails.reasoning +=
            typeof usage.completionDetails.reasoning === 'number'
              ? usage.completionDetails.reasoning
              : 0;
        }

        if (result.completionDetails.acceptedPrediction !== undefined) {
          result.completionDetails.acceptedPrediction +=
            typeof usage.completionDetails.acceptedPrediction === 'number'
              ? usage.completionDetails.acceptedPrediction
              : 0;
        }

        if (result.completionDetails.rejectedPrediction !== undefined) {
          result.completionDetails.rejectedPrediction +=
            typeof usage.completionDetails.rejectedPrediction === 'number'
              ? usage.completionDetails.rejectedPrediction
              : 0;
        }
      }

      // Add assertion statistics if present
      if (usage.assertions && result.assertions) {
        if (result.assertions.total !== undefined) {
          result.assertions.total +=
            typeof usage.assertions.total === 'number' ? usage.assertions.total : 0;
        }

        if (result.assertions.prompt !== undefined) {
          result.assertions.prompt +=
            typeof usage.assertions.prompt === 'number' ? usage.assertions.prompt : 0;
        }

        if (result.assertions.completion !== undefined) {
          result.assertions.completion +=
            typeof usage.assertions.completion === 'number' ? usage.assertions.completion : 0;
        }

        if (result.assertions.cached !== undefined) {
          result.assertions.cached +=
            typeof usage.assertions.cached === 'number' ? usage.assertions.cached : 0;
        }
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
      prompt: 0,
      completion: 0,
      cached: 0,
      total: 0,
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
      ...current,
    };

    // Add basic fields safely
    if (typeof update.prompt === 'number') {
      result.prompt = (result.prompt || 0) + update.prompt;
    }

    if (typeof update.completion === 'number') {
      result.completion = (result.completion || 0) + update.completion;
    }

    if (typeof update.cached === 'number') {
      result.cached = (result.cached || 0) + update.cached;
    }

    if (typeof update.total === 'number') {
      result.total = (result.total || 0) + update.total;
    }

    if (typeof update.numRequests === 'number') {
      result.numRequests = (result.numRequests || 0) + update.numRequests;
    }

    // Handle completion details
    if (update.completionDetails) {
      if (!result.completionDetails) {
        result.completionDetails = {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        };
      }

      if (typeof update.completionDetails.reasoning === 'number') {
        result.completionDetails.reasoning =
          (result.completionDetails.reasoning || 0) + update.completionDetails.reasoning;
      }

      if (typeof update.completionDetails.acceptedPrediction === 'number') {
        result.completionDetails.acceptedPrediction =
          (result.completionDetails.acceptedPrediction || 0) +
          update.completionDetails.acceptedPrediction;
      }

      if (typeof update.completionDetails.rejectedPrediction === 'number') {
        result.completionDetails.rejectedPrediction =
          (result.completionDetails.rejectedPrediction || 0) +
          update.completionDetails.rejectedPrediction;
      }
    }

    // Handle assertions
    if (update.assertions) {
      if (!result.assertions) {
        result.assertions = {
          total: 0,
          prompt: 0,
          completion: 0,
          cached: 0,
        };
      }

      if (typeof update.assertions.prompt === 'number') {
        result.assertions.prompt = (result.assertions.prompt || 0) + update.assertions.prompt;
      }

      if (typeof update.assertions.completion === 'number') {
        result.assertions.completion =
          (result.assertions.completion || 0) + update.assertions.completion;
      }

      if (typeof update.assertions.cached === 'number') {
        result.assertions.cached = (result.assertions.cached || 0) + update.assertions.cached;
      }

      if (typeof update.assertions.total === 'number') {
        result.assertions.total = (result.assertions.total || 0) + update.assertions.total;
      }
    }

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
