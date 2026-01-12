import logger from '../logger';
import { accumulateTokenUsage, createEmptyTokenUsage } from './tokenUsageUtils';

import type { TokenUsage } from '../types/shared';

/**
 * Listener callback type for token usage updates.
 */
export type TokenUsageListener = (providerId: string, usage: TokenUsage) => void;

/**
 * A utility class for tracking token usage across an evaluation.
 *
 * Supports real-time subscriptions for UI updates via the subscribe() method.
 *
 * @deprecated Use OpenTelemetry tracing instead for per-call token tracking.
 * This class provides only cumulative totals and will be removed in a future version.
 *
 * For new implementations, use the OTEL-based tracing infrastructure:
 * - Enable tracing with `PROMPTFOO_OTEL_ENABLED=true`
 * - Use `getTokenUsageFromTrace()` from `src/util/tokenUsageCompat.ts` for per-trace usage
 * - Token usage is automatically captured as GenAI semantic convention span attributes
 *
 * @see src/tracing/genaiTracer.ts for the new tracing implementation
 * @see src/util/tokenUsageCompat.ts for the compatibility layer
 */
export class TokenUsageTracker {
  private static instance: TokenUsageTracker;
  private providersMap: Map<string, TokenUsage> = new Map();
  private listeners: Set<TokenUsageListener> = new Set();

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
   * Subscribe to token usage updates.
   *
   * The listener will be called whenever trackUsage() is invoked with the
   * provider ID and the updated cumulative usage for that provider.
   *
   * @param listener - Callback function to receive updates
   * @returns Unsubscribe function
   */
  public subscribe(listener: TokenUsageListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of a token usage update.
   */
  private notifyListeners(providerId: string, usage: TokenUsage): void {
    for (const listener of this.listeners) {
      try {
        listener(providerId, usage);
      } catch (error) {
        logger.debug(`Error in token usage listener: ${error}`);
      }
    }
  }

  /**
   * Track token usage for a provider
   * @param provider The provider to track usage for
   * @param usage The token usage to track
   */
  public trackUsage(providerId: string, usage: TokenUsage = { numRequests: 1 }): void {
    const current = this.providersMap.get(providerId) ?? createEmptyTokenUsage();
    // Create a copy and accumulate the usage
    const updated = { ...current };
    accumulateTokenUsage(updated, usage);
    this.providersMap.set(providerId, updated);
    logger.debug(
      `Tracked token usage for ${providerId}: total=${usage.total ?? 0}, cached=${usage.cached ?? 0}`,
    );

    // Notify subscribers of the update
    this.notifyListeners(providerId, updated);
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
    this.listeners.clear();
  }

  /**
   * Get the number of active listeners (for debugging/testing).
   */
  public getListenerCount(): number {
    return this.listeners.size;
  }
}
