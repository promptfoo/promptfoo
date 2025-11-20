/**
 * Test utilities for handling timers, debounce, and async operations
 *
 * These utilities help speed up tests that use setTimeout, debounce, or other time-based operations
 * by using fake timers to fast-forward time instead of actually waiting.
 */

import { vi } from 'vitest';
import { act } from '@testing-library/react';

/**
 * Sets up fake timers for a test.
 * Call this in beforeEach() for tests that use timers.
 *
 * @example
 * beforeEach(() => {
 *   setupFakeTimers();
 * });
 */
export function setupFakeTimers() {
  vi.useFakeTimers();
}

/**
 * Cleans up fake timers after a test.
 * Call this in afterEach() after setting up fake timers.
 *
 * @example
 * afterEach(() => {
 *   cleanupFakeTimers();
 * });
 */
export function cleanupFakeTimers() {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
}

/**
 * Advances timers by a specified amount and waits for updates.
 * Use this to fast-forward through debounce delays, setTimeout calls, etc.
 *
 * @param ms - Milliseconds to advance
 *
 * @example
 * // Component has 300ms debounce
 * fireEvent.change(input, { target: { value: 'test' } });
 * await advanceTimers(300); // Fast-forward through debounce
 * expect(mockFn).toHaveBeenCalled();
 */
export async function advanceTimers(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

/**
 * Advances timers to the next timer and waits for updates.
 * Useful when you don't know the exact delay time.
 *
 * @example
 * fireEvent.click(button);
 * await advanceToNextTimer(); // Run next setTimeout/setInterval
 * expect(element).toBeInTheDocument();
 */
export async function advanceToNextTimer() {
  await act(async () => {
    vi.advanceTimersToNextTimer();
  });
}

/**
 * Runs all pending timers and waits for updates.
 * Use this at the end of tests to ensure all timers have completed.
 *
 * @example
 * afterEach(async () => {
 *   await runAllTimers();
 *   cleanupFakeTimers();
 * });
 */
export async function runAllTimers() {
  await act(async () => {
    vi.runAllTimers();
  });
}

/**
 * Waits for pending promises and updates.
 * Use this after triggering async operations.
 *
 * @example
 * fireEvent.click(button);
 * await waitForUpdates();
 * expect(screen.getByText('Success')).toBeInTheDocument();
 */
export async function waitForUpdates() {
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * Helper to handle components with debounced inputs.
 * Automatically advances past the debounce delay.
 *
 * @param callback - Function to run that triggers the debounced action
 * @param debounceMs - Debounce delay in milliseconds (default: 300)
 *
 * @example
 * await withDebounce(() => {
 *   fireEvent.change(input, { target: { value: 'test' } });
 * }, 300);
 * expect(updateFn).toHaveBeenCalled();
 */
export async function withDebounce(callback: () => void, debounceMs = 300) {
  callback();
  await advanceTimers(debounceMs);
  await waitForUpdates();
}
