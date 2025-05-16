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
    const result: TokenUsage = {};

    for (const usage of this.providersMap.values()) {
      this.mergeUsage(result, usage);
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
   * Merge token usage records
   * @param current The current token usage
   * @param update The new token usage to merge
   * @returns The merged token usage
   */
  private mergeUsage(current: TokenUsage, update: TokenUsage): TokenUsage {
    const result = { ...current };

    // Add basic fields
    result.prompt = (result.prompt || 0) + (update.prompt || 0);
    result.completion = (result.completion || 0) + (update.completion || 0);
    result.cached = (result.cached || 0) + (update.cached || 0);
    result.total = (result.total || 0) + (update.total || 0);
    result.numRequests = (result.numRequests || 0) + (update.numRequests || 1);

    // Handle completion details
    if (update.completionDetails) {
      if (!result.completionDetails) {
        result.completionDetails = {};
      }

      result.completionDetails.reasoning =
        (result.completionDetails?.reasoning || 0) + (update.completionDetails.reasoning || 0);

      result.completionDetails.acceptedPrediction =
        (result.completionDetails?.acceptedPrediction || 0) +
        (update.completionDetails.acceptedPrediction || 0);

      result.completionDetails.rejectedPrediction =
        (result.completionDetails?.rejectedPrediction || 0) +
        (update.completionDetails.rejectedPrediction || 0);
    }

    // Handle assertions
    if (update.assertions) {
      if (!result.assertions) {
        result.assertions = {};
      }

      result.assertions.prompt = (result.assertions?.prompt || 0) + (update.assertions.prompt || 0);

      result.assertions.completion =
        (result.assertions?.completion || 0) + (update.assertions.completion || 0);

      result.assertions.cached = (result.assertions?.cached || 0) + (update.assertions.cached || 0);

      result.assertions.total = (result.assertions?.total || 0) + (update.assertions.total || 0);
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
