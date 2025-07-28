import logger from '../logger';

import type { TokenUsage } from '../types/shared';
import { createEmptyTokenUsage, accumulateTokenUsage } from './tokenUsageUtils';

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

    const current = this.providersMap.get(providerId) ?? createEmptyTokenUsage();
    // Create a copy and accumulate the usage
    const updated = { ...current };
    accumulateTokenUsage(updated, usage);
    this.providersMap.set(providerId, updated);
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
    const result: TokenUsage = createEmptyTokenUsage();

    // Accumulate totals from all providers
    for (const usage of this.providersMap.values()) {
      accumulateTokenUsage(result, usage);
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
}
