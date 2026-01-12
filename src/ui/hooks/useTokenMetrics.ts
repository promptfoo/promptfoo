/**
 * Hook for subscribing to TokenUsageTracker updates during evaluation.
 *
 * This hook uses an event-based subscription pattern with debouncing for
 * efficient, real-time token usage updates in the UI.
 */

import { useCallback, useEffect, useRef } from 'react';

import { TokenUsageTracker } from '../../util/tokenUsage';
import { TIMING } from '../constants';

import type { TokenUsage } from '../../types/shared';
import type { EvalAction, TokenMetricsPayload } from '../contexts/EvalContext';

/**
 * Convert TokenUsage to TokenMetricsPayload for dispatch.
 */
function tokenUsageToPayload(usage: TokenUsage | undefined): TokenMetricsPayload {
  return {
    prompt: usage?.prompt ?? 0,
    completion: usage?.completion ?? 0,
    cached: usage?.cached ?? 0,
    total: usage?.total ?? 0,
    numRequests: usage?.numRequests ?? 0,
  };
}

/**
 * Normalize a TokenUsageTracker provider ID to match EvalContext provider IDs.
 *
 * TokenUsageTracker uses IDs like "openai:gpt-4o-mini (OpenAiGenericProvider)"
 * but EvalContext uses IDs like "openai:gpt-4o-mini" (the label or provider.id()).
 *
 * This function strips the constructor name suffix to get the base provider ID.
 */
function normalizeProviderId(trackerId: string): string {
  // Handle null/empty provider IDs
  if (!trackerId || trackerId.trim() === '') {
    return 'unknown-provider';
  }
  // Match pattern: "provider-id (ConstructorName)"
  const match = trackerId.match(/^(.+?)\s+\([^)]+\)$/);
  return match ? match[1] : trackerId;
}

/**
 * Hook to subscribe to TokenUsageTracker for real-time token metrics.
 *
 * Uses event-based subscription with debouncing for efficient updates:
 * - Subscribes to TokenUsageTracker on mount
 * - Batches rapid updates within TOKEN_DEBOUNCE_MS window
 * - Flushes immediately on first update, then debounces subsequent updates
 * - Normalizes provider IDs to match EvalContext keys
 *
 * @param dispatch - The dispatch function from EvalContext
 * @param _providerIds - List of provider IDs (unused, kept for API compatibility)
 * @param isRunning - Whether the evaluation is currently running
 * @param _pollIntervalMs - Unused, kept for API compatibility
 */
export function useTokenMetrics(
  dispatch: React.Dispatch<EvalAction>,
  _providerIds: string[],
  isRunning: boolean,
  _pollIntervalMs: number = 500,
): void {
  // Pending updates to batch
  const pendingUpdates = useRef<Map<string, TokenUsage>>(new Map());
  // Debounce timer
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track if we've dispatched at least once (for immediate first update)
  const hasDispatched = useRef(false);
  // Track mounted state to prevent updates after unmount
  const isMounted = useRef(true);

  /**
   * Flush all pending updates to the UI.
   */
  const flushUpdates = useCallback(() => {
    // Don't dispatch if unmounted (prevents race with debounce timer)
    if (!isMounted.current || pendingUpdates.current.size === 0) {
      return;
    }

    // Dispatch all pending updates
    for (const [trackerId, usage] of pendingUpdates.current) {
      const normalizedId = normalizeProviderId(trackerId);
      dispatch({
        type: 'UPDATE_TOKEN_METRICS',
        payload: {
          providerId: normalizedId,
          tokenUsage: tokenUsageToPayload(usage),
        },
      });
    }

    pendingUpdates.current.clear();
    hasDispatched.current = true;
  }, [dispatch]);

  /**
   * Schedule a debounced flush.
   */
  const scheduleFlush = useCallback(() => {
    // Clear existing timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // If this is the first update, flush immediately for responsiveness
    if (!hasDispatched.current) {
      flushUpdates();
      return;
    }

    // Otherwise, debounce
    debounceTimer.current = setTimeout(() => {
      flushUpdates();
      debounceTimer.current = null;
    }, TIMING.TOKEN_DEBOUNCE_MS);
  }, [flushUpdates]);

  /**
   * Handle a token usage update from the tracker.
   */
  const handleUsageUpdate = useCallback(
    (providerId: string, usage: TokenUsage) => {
      // Accumulate the update
      pendingUpdates.current.set(providerId, usage);
      // Schedule a flush
      scheduleFlush();
    },
    [scheduleFlush],
  );

  useEffect(() => {
    if (!isRunning) {
      // Clear state when not running
      pendingUpdates.current.clear();
      hasDispatched.current = false;
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
      return;
    }

    // Reset mounted state when starting
    isMounted.current = true;

    // Subscribe to token usage updates
    const tracker = TokenUsageTracker.getInstance();
    const unsubscribe = tracker.subscribe(handleUsageUpdate);

    // Also fetch current state in case we missed updates before subscribing
    for (const trackerId of tracker.getProviderIds()) {
      const usage = tracker.getProviderUsage(trackerId);
      if (usage && (usage.total ?? 0) > 0) {
        handleUsageUpdate(trackerId, usage);
      }
    }

    return () => {
      // Mark as unmounted first to prevent any pending timers from dispatching
      isMounted.current = false;
      // Unsubscribe
      unsubscribe();
      // Clear any pending timers
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
      pendingUpdates.current.clear();
    };
  }, [isRunning, handleUsageUpdate]);
}

/**
 * Hook to get aggregated token metrics for all providers.
 *
 * This is a simpler hook that just returns the current totals from
 * TokenUsageTracker without subscribing to updates.
 */
export function useAggregateTokenMetrics(): TokenMetricsPayload {
  const tracker = TokenUsageTracker.getInstance();
  const totalUsage = tracker.getTotalUsage();
  return tokenUsageToPayload(totalUsage);
}
