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
   * Track character usage for a provider
   * @param providerId Provider ID
   * @param promptText The prompt text
   * @param completionText The completion text
   */
  public trackCharUsage(providerId: string, promptText?: string, completionText?: string): void {
    if (!promptText && !completionText) {
      return;
    }

    const current = this.providersMap.get(providerId) || {};
    const usage: TokenUsage = { ...current };

    // Count bytes rather than JavaScript string length for more accurate measurement
    if (promptText) {
      const promptBytes = Buffer.byteLength(promptText, 'utf8');
      usage.promptChars = (usage.promptChars || 0) + promptBytes;
    }

    if (completionText) {
      const completionBytes = Buffer.byteLength(completionText, 'utf8');
      usage.completionChars = (usage.completionChars || 0) + completionBytes;
    }

    if (promptText || completionText) {
      const promptCharsToAdd = promptText ? Buffer.byteLength(promptText, 'utf8') : 0;
      const completionCharsToAdd = completionText ? Buffer.byteLength(completionText, 'utf8') : 0;
      usage.totalChars = (usage.totalChars || 0) + promptCharsToAdd + completionCharsToAdd;
    }

    // Always increment the request count when tracking usage
    usage.numRequests = (usage.numRequests || 0) + 1;

    this.providersMap.set(providerId, usage);
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
      promptChars: 0,
      completionChars: 0,
      totalChars: 0,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
    };

    // Explicitly accumulate totals from all providers
    for (const usage of this.providersMap.values()) {
      // Add token counts
      result.total += usage.total || 0;
      result.prompt += usage.prompt || 0;
      result.completion += usage.completion || 0;
      result.cached += usage.cached || 0;
      result.numRequests += usage.numRequests || 0;

      // Add character counts
      result.promptChars += usage.promptChars || 0;
      result.completionChars += usage.completionChars || 0;
      result.totalChars += usage.totalChars || 0;

      // Add completion details
      if (usage.completionDetails) {
        result.completionDetails.reasoning += usage.completionDetails.reasoning || 0;
        result.completionDetails.acceptedPrediction +=
          usage.completionDetails.acceptedPrediction || 0;
        result.completionDetails.rejectedPrediction +=
          usage.completionDetails.rejectedPrediction || 0;
      }

      // Add assertion statistics if present
      if (usage.assertions) {
        if (!result.assertions) {
          result.assertions = {
            total: 0,
            prompt: 0,
            completion: 0,
            cached: 0,
            promptChars: 0,
            completionChars: 0,
            totalChars: 0,
          };
        }

        result.assertions.total += usage.assertions.total || 0;
        result.assertions.prompt += usage.assertions.prompt || 0;
        result.assertions.completion += usage.assertions.completion || 0;
        result.assertions.cached += usage.assertions.cached || 0;
        result.assertions.promptChars += usage.assertions.promptChars || 0;
        result.assertions.completionChars += usage.assertions.completionChars || 0;
        result.assertions.totalChars += usage.assertions.totalChars || 0;
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
      promptChars: 0,
      completionChars: 0,
      totalChars: 0,
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
        promptChars: 0,
        completionChars: 0,
        totalChars: 0,
      },
      ...current
    };

    // Add basic fields
    result.prompt = (result.prompt || 0) + (update.prompt || 0);
    result.completion = (result.completion || 0) + (update.completion || 0);
    result.cached = (result.cached || 0) + (update.cached || 0);
    result.total = (result.total || 0) + (update.total || 0);
    result.numRequests = (result.numRequests || 0) + (update.numRequests || 1);

    // Add character counts
    result.promptChars = (result.promptChars || 0) + (update.promptChars || 0);
    result.completionChars = (result.completionChars || 0) + (update.completionChars || 0);
    result.totalChars = (result.totalChars || 0) + (update.totalChars || 0);

    // Handle completion details
    if (update.completionDetails) {
      if (!result.completionDetails) {
        result.completionDetails = {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        };
      }

      result.completionDetails.reasoning =
        (result.completionDetails.reasoning || 0) + (update.completionDetails.reasoning || 0);

      result.completionDetails.acceptedPrediction =
        (result.completionDetails.acceptedPrediction || 0) +
        (update.completionDetails.acceptedPrediction || 0);

      result.completionDetails.rejectedPrediction =
        (result.completionDetails.rejectedPrediction || 0) +
        (update.completionDetails.rejectedPrediction || 0);
    }

    // Handle assertions
    if (update.assertions) {
      if (!result.assertions) {
        result.assertions = {
          total: 0,
          prompt: 0,
          completion: 0,
          cached: 0,
          promptChars: 0,
          completionChars: 0,
          totalChars: 0,
        };
      }

      result.assertions.prompt = (result.assertions.prompt || 0) + (update.assertions.prompt || 0);
      result.assertions.completion = (result.assertions.completion || 0) + (update.assertions.completion || 0);
      result.assertions.cached = (result.assertions.cached || 0) + (update.assertions.cached || 0);
      result.assertions.total = (result.assertions.total || 0) + (update.assertions.total || 0);
      result.assertions.promptChars = (result.assertions.promptChars || 0) + (update.assertions.promptChars || 0);
      result.assertions.completionChars = (result.assertions.completionChars || 0) + (update.assertions.completionChars || 0);
      result.assertions.totalChars = (result.assertions.totalChars || 0) + (update.assertions.totalChars || 0);
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

      // Character counting is now handled in evaluator.ts to avoid double-counting
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
