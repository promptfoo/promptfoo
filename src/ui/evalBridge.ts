/**
 * Bridge between the evaluator and the Ink UI.
 *
 * This module provides the connection between the evaluator's progress callbacks
 * and the React state management in the Ink UI.
 */

import type { EvaluateOptions, EvaluateTable, PromptMetrics, RunEvalOptions } from '../types/index';
import type { EvalAction, LogEntry, SessionPhase, SharingStatus } from './contexts/EvalContext';

// ============================================================================
// Batching Infrastructure
// ============================================================================

/**
 * A single progress item to be batched.
 * Contains all data needed to update state for one test completion.
 */
export interface BatchProgressItem {
  provider: string;
  passed: boolean;
  error: boolean;
  latencyMs: number;
  cost: number;
  completed: number;
  total: number;
}

/**
 * Batch interval in milliseconds.
 * At 50ms, we get max 20 batches/second which is visually smooth.
 * Lower = more responsive but more CPU; Higher = less CPU but choppier.
 */
const BATCH_INTERVAL_MS = 50;

/**
 * Creates a batching dispatcher that queues progress updates and flushes them
 * at a throttled rate. This dramatically reduces the number of state updates
 * and re-renders when running with high concurrency.
 *
 * Design:
 * - First item in a batch is dispatched immediately for responsiveness
 * - Subsequent items are queued and flushed after BATCH_INTERVAL_MS
 * - On flush, all queued items are sent as a single BATCH_PROGRESS event
 * - Timer is cleared on cleanup to prevent memory leaks
 */
function createBatchingDispatcher(dispatch: (action: EvalAction) => void) {
  const pendingItems: BatchProgressItem[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let isFirstInBatch = true;

  function flushBatch() {
    if (pendingItems.length > 0) {
      dispatch({
        type: 'BATCH_PROGRESS',
        payload: { items: [...pendingItems] },
      });
      pendingItems.length = 0;
    }
    flushTimer = null;
    isFirstInBatch = true;
  }

  function queueProgress(item: BatchProgressItem) {
    // First item dispatched immediately for responsiveness
    if (isFirstInBatch) {
      isFirstInBatch = false;
      dispatch({
        type: 'PROGRESS',
        payload: {
          completed: item.completed,
          total: item.total,
          provider: item.provider,
          passed: item.passed,
          error: item.error ? 'Test error' : undefined,
          latencyMs: item.latencyMs,
          cost: item.cost,
        },
      });
      // Schedule flush for any subsequent items
      if (!flushTimer) {
        flushTimer = setTimeout(flushBatch, BATCH_INTERVAL_MS);
      }
      return;
    }

    // Queue subsequent items
    pendingItems.push(item);

    // Ensure flush is scheduled
    if (!flushTimer) {
      flushTimer = setTimeout(flushBatch, BATCH_INTERVAL_MS);
    }
  }

  function cleanup() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    // Flush any remaining items
    if (pendingItems.length > 0) {
      flushBatch();
    }
  }

  return { queueProgress, flushBatch, cleanup };
}

// ============================================================================
// Delta Tracking
// ============================================================================

/**
 * State for tracking deltas between progress callbacks for a single prompt.
 * The key insight is that metrics are tracked per-PROMPT (not per-provider),
 * so we need to track deltas at the prompt level to compute correct pass/fail counts.
 */
interface PromptTrackingState {
  lastMetrics: PromptMetrics | null;
  lastCallCount: number;
}

/**
 * State for tracking deltas across all prompts.
 */
interface ProgressTrackingState {
  /** Per-prompt tracking state (keyed by providerId:promptIdx) */
  prompts: Map<string, PromptTrackingState>;
  /** Total completed count */
  lastCompleted: number;
}

/**
 * Format variables for display in the UI.
 */
function formatVarsForDisplay(
  vars: Record<string, unknown> | undefined,
  maxLength: number,
): string {
  if (!vars || Object.keys(vars).length === 0) {
    return '';
  }

  const entries = Object.entries(vars);
  const formatted = entries
    .slice(0, 3)
    .map(([k, v]) => {
      const valueStr = typeof v === 'string' ? v : JSON.stringify(v);
      const truncatedValue = valueStr.length > 20 ? valueStr.slice(0, 17) + '...' : valueStr;
      return `${k}=${truncatedValue}`;
    })
    .join(', ');

  if (formatted.length > maxLength) {
    return formatted.slice(0, maxLength - 3) + '...';
  }

  return formatted;
}

/**
 * Creates a progress callback that dispatches actions to the EvalContext.
 *
 * This function uses delta tracking to determine per-test pass/fail/error
 * from the aggregate PromptMetrics. Token usage updates are handled separately
 * by the useTokenMetrics hook with debouncing for better performance.
 *
 * @param dispatch - The dispatch function from EvalContext
 * @returns A progress callback function compatible with the evaluator
 */
export function createProgressCallback(
  dispatch: React.Dispatch<EvalAction>,
): (
  completed: number,
  total: number,
  index: number,
  evalStep?: RunEvalOptions,
  metrics?: PromptMetrics,
) => void {
  // Track state between callbacks for delta calculations - PER PROMPT
  // Key insight: metrics are tracked per-prompt (each prompt has its own metrics object),
  // so we must track deltas at the prompt level, not provider level
  const trackingState: ProgressTrackingState = {
    prompts: new Map(),
    lastCompleted: 0,
  };

  return (
    completed: number,
    total: number,
    _index: number,
    evalStep?: RunEvalOptions,
    metrics?: PromptMetrics,
  ) => {
    if (!evalStep) {
      // This can happen for comparison steps
      dispatch({
        type: 'PROGRESS',
        payload: { completed, total },
      });
      return;
    }

    const providerId = evalStep.provider.label || evalStep.provider.id();
    const promptIdx = evalStep.promptIdx;
    // Create a unique key for this provider+prompt combination
    const trackingKey = `${providerId}:${promptIdx}`;

    const prompt =
      typeof evalStep.prompt.raw === 'string'
        ? evalStep.prompt.raw.slice(0, 50).replace(/\n/g, ' ')
        : '[complex prompt]';
    const vars = formatVarsForDisplay(evalStep.test.vars, 50);

    // Calculate deltas from last callback FOR THIS PROMPT to determine this test's result
    let testPassed = false;
    let testFailed = false;
    let testError = false;
    let latencyMs = 0;
    let cost = 0;

    if (metrics) {
      // Get or create per-prompt tracking state
      let promptState = trackingState.prompts.get(trackingKey);
      if (!promptState) {
        promptState = { lastMetrics: null, lastCallCount: 0 };
        trackingState.prompts.set(trackingKey, promptState);
      }

      const lastMetrics = promptState.lastMetrics;

      // Calculate deltas - if this is the first callback, deltas are the metrics themselves
      const prevPass = lastMetrics?.testPassCount ?? 0;
      const prevFail = lastMetrics?.testFailCount ?? 0;
      const prevError = lastMetrics?.testErrorCount ?? 0;
      const prevLatency = lastMetrics?.totalLatencyMs ?? 0;
      const prevCost = lastMetrics?.cost ?? 0;

      const deltaPass = metrics.testPassCount - prevPass;
      const deltaFail = metrics.testFailCount - prevFail;
      const deltaError = metrics.testErrorCount - prevError;
      const deltaLatency = metrics.totalLatencyMs - prevLatency;
      const deltaCost = metrics.cost - prevCost;

      // Determine test result - exactly one should be true for each test
      testPassed = deltaPass > 0;
      testFailed = deltaFail > 0 && !testPassed;
      testError = deltaError > 0 && !testPassed && !testFailed;

      // If none of the deltas are positive but we got a callback, assume it's a pass
      // This handles edge cases where metrics might not update correctly
      if (!testPassed && !testFailed && !testError) {
        // Check if total test count increased - if so, something completed
        const prevTotal =
          (lastMetrics?.testPassCount ?? 0) +
          (lastMetrics?.testFailCount ?? 0) +
          (lastMetrics?.testErrorCount ?? 0);
        const currentTotal = metrics.testPassCount + metrics.testFailCount + metrics.testErrorCount;
        if (currentTotal > prevTotal) {
          // Determine which one increased by looking at the deltas again
          if (deltaPass >= deltaFail && deltaPass >= deltaError) {
            testPassed = true;
          } else if (deltaFail >= deltaError) {
            testFailed = true;
          } else {
            testError = true;
          }
        }
      }

      latencyMs = Math.max(0, deltaLatency);
      cost = Math.max(0, deltaCost);

      // Note: TEST_RESULT dispatch removed - latency/cost now merged into PROGRESS
      // This reduces dispatches per test from 3 to 2 (or 1 if no grading tokens)

      // Update per-prompt tracking state - deep copy the metrics values we care about
      promptState.lastMetrics = {
        ...metrics,
        testPassCount: metrics.testPassCount,
        testFailCount: metrics.testFailCount,
        testErrorCount: metrics.testErrorCount,
        totalLatencyMs: metrics.totalLatencyMs,
        cost: metrics.cost,
      };
      promptState.lastCallCount += 1;
      trackingState.lastCompleted = completed;
    }

    // Note: Token metrics are now handled by useTokenMetrics hook which subscribes
    // to TokenUsageTracker with 100ms debouncing. Removed direct dispatch here
    // to avoid double updates and improve responsiveness.

    // Extract and dispatch grading/assertion token usage from metrics
    if (metrics?.tokenUsage?.assertions) {
      const assertions = metrics.tokenUsage.assertions;
      if (assertions.total && assertions.total > 0) {
        dispatch({
          type: 'SET_GRADING_TOKENS',
          payload: {
            providerId,
            tokens: {
              total: assertions.total ?? 0,
              prompt: assertions.prompt ?? 0,
              completion: assertions.completion ?? 0,
              cached: assertions.cached ?? 0,
              reasoning: assertions.completionDetails?.reasoning ?? 0,
            },
          },
        });
      }
    }

    // Dispatch unified progress update (merged with TEST_RESULT for efficiency)
    // This is now the ONLY per-test dispatch (grading tokens is conditional)
    dispatch({
      type: 'PROGRESS',
      payload: {
        completed,
        total,
        provider: providerId,
        prompt,
        vars,
        passed: testPassed,
        error: testError ? 'Test error' : undefined,
        // Merged from TEST_RESULT - latency and cost per test
        latencyMs,
        cost,
      },
    });
  };
}

/**
 * Creates a progress callback that uses batching for high-concurrency performance.
 * Instead of dispatching every progress update immediately, updates are queued
 * and flushed at a throttled rate (50ms), dramatically reducing state updates
 * and re-renders when running with -j 100+.
 *
 * @param dispatch - The dispatch function from EvalContext (used for grading tokens)
 * @param queueProgress - The batching queue function
 * @returns A progress callback function compatible with the evaluator
 */
function createProgressCallbackWithBatching(
  dispatch: React.Dispatch<EvalAction>,
  queueProgress: (item: BatchProgressItem) => void,
): (
  completed: number,
  total: number,
  index: number,
  evalStep?: RunEvalOptions,
  metrics?: PromptMetrics,
) => void {
  // Track state between callbacks for delta calculations - PER PROMPT
  const trackingState: ProgressTrackingState = {
    prompts: new Map(),
    lastCompleted: 0,
  };

  return (
    completed: number,
    total: number,
    _index: number,
    evalStep?: RunEvalOptions,
    metrics?: PromptMetrics,
  ) => {
    if (!evalStep) {
      // For non-test progress (e.g., comparison steps), dispatch directly
      dispatch({
        type: 'PROGRESS',
        payload: { completed, total },
      });
      return;
    }

    const providerId = evalStep.provider.label || evalStep.provider.id();
    const promptIdx = evalStep.promptIdx;
    const trackingKey = `${providerId}:${promptIdx}`;

    // Calculate deltas from last callback FOR THIS PROMPT
    let testPassed = false;
    let testError = false;
    let latencyMs = 0;
    let cost = 0;

    if (metrics) {
      // Get or create per-prompt tracking state
      let promptState = trackingState.prompts.get(trackingKey);
      if (!promptState) {
        promptState = { lastMetrics: null, lastCallCount: 0 };
        trackingState.prompts.set(trackingKey, promptState);
      }

      const lastMetrics = promptState.lastMetrics;

      // Calculate deltas
      const prevPass = lastMetrics?.testPassCount ?? 0;
      const prevFail = lastMetrics?.testFailCount ?? 0;
      const prevError = lastMetrics?.testErrorCount ?? 0;
      const prevLatency = lastMetrics?.totalLatencyMs ?? 0;
      const prevCost = lastMetrics?.cost ?? 0;

      const deltaPass = metrics.testPassCount - prevPass;
      const deltaFail = metrics.testFailCount - prevFail;
      const deltaError = metrics.testErrorCount - prevError;
      const deltaLatency = metrics.totalLatencyMs - prevLatency;
      const deltaCost = metrics.cost - prevCost;

      // Determine test result
      testPassed = deltaPass > 0;
      const testFailed = deltaFail > 0 && !testPassed;
      testError = deltaError > 0 && !testPassed && !testFailed;

      // Fallback logic for edge cases
      if (!testPassed && !testFailed && !testError) {
        const prevTotal =
          (lastMetrics?.testPassCount ?? 0) +
          (lastMetrics?.testFailCount ?? 0) +
          (lastMetrics?.testErrorCount ?? 0);
        const currentTotal = metrics.testPassCount + metrics.testFailCount + metrics.testErrorCount;
        if (currentTotal > prevTotal) {
          if (deltaPass >= deltaFail && deltaPass >= deltaError) {
            testPassed = true;
          } else if (deltaFail >= deltaError) {
            // testFailed - but we can't set it here, use testPassed=false, testError=false
          } else {
            testError = true;
          }
        }
      }

      latencyMs = Math.max(0, deltaLatency);
      cost = Math.max(0, deltaCost);

      // Update tracking state
      promptState.lastMetrics = {
        ...metrics,
        testPassCount: metrics.testPassCount,
        testFailCount: metrics.testFailCount,
        testErrorCount: metrics.testErrorCount,
        totalLatencyMs: metrics.totalLatencyMs,
        cost: metrics.cost,
      };
      promptState.lastCallCount += 1;
      trackingState.lastCompleted = completed;
    }

    // Grading tokens are still dispatched directly (low frequency, important accuracy)
    if (metrics?.tokenUsage?.assertions) {
      const assertions = metrics.tokenUsage.assertions;
      if (assertions.total && assertions.total > 0) {
        dispatch({
          type: 'SET_GRADING_TOKENS',
          payload: {
            providerId,
            tokens: {
              total: assertions.total ?? 0,
              prompt: assertions.prompt ?? 0,
              completion: assertions.completion ?? 0,
              cached: assertions.cached ?? 0,
              reasoning: assertions.completionDetails?.reasoning ?? 0,
            },
          },
        });
      }
    }

    // Queue progress update for batching (instead of direct dispatch)
    queueProgress({
      provider: providerId,
      passed: testPassed,
      error: testError,
      latencyMs,
      cost,
      completed,
      total,
    });
  };
}

/**
 * Interface for the eval UI controller.
 */
export interface EvalUIController {
  /** Initialize the UI with evaluation parameters */
  init: (totalTests: number, providers: string[], concurrency?: number) => void;
  /** Mark evaluation as started */
  start: () => void;
  /** Update progress */
  progress: (
    completed: number,
    total: number,
    index: number,
    evalStep?: RunEvalOptions,
    metrics?: PromptMetrics,
  ) => void;
  /** Add an error */
  addError: (
    provider: string,
    prompt: string,
    message: string,
    vars?: Record<string, unknown>,
  ) => void;
  /** Add a log entry (for verbose mode) */
  addLog: (entry: LogEntry) => void;
  /** Mark evaluation as complete */
  complete: (summary: { passed: number; failed: number; errors: number }) => void;
  /** Mark evaluation as errored */
  error: (message: string) => void;
  /** Set the current phase */
  setPhase: (phase: 'loading' | 'evaluating' | 'grading' | 'completed' | 'error') => void;
  /** Set the share URL */
  setShareUrl: (url: string) => void;
  /** Set the sharing status (for background sharing progress) */
  setSharingStatus: (status: SharingStatus, url?: string) => void;
  /** Set the session phase (transition between eval and results views) */
  setSessionPhase: (phase: SessionPhase) => void;
  /** Transition to results view with table data */
  showResults: (tableData: EvaluateTable) => void;
  /** Cleanup batching timers (called automatically on complete) */
  cleanup: () => void;
}

/**
 * Creates a UI controller that wraps dispatch for easier use from non-React code.
 * Uses batching for high-concurrency performance.
 *
 * @param dispatch - The dispatch function from EvalContext
 * @returns An EvalUIController object
 */
export function createEvalUIController(dispatch: React.Dispatch<EvalAction>): EvalUIController {
  // Create batching dispatcher for high-concurrency performance
  const batcher = createBatchingDispatcher(dispatch);

  // Create the progress callback with integrated batching
  const progressCallback = createProgressCallbackWithBatching(dispatch, batcher.queueProgress);

  return {
    init: (totalTests: number, providers: string[], concurrency?: number) => {
      dispatch({ type: 'INIT', payload: { totalTests, providers, concurrency } });
    },

    start: () => {
      dispatch({ type: 'START' });
    },

    progress: progressCallback,

    addError: (
      provider: string,
      prompt: string,
      message: string,
      vars?: Record<string, unknown>,
    ) => {
      dispatch({ type: 'ADD_ERROR', payload: { provider, prompt, message, vars } });
    },

    addLog: (entry: LogEntry) => {
      dispatch({ type: 'ADD_LOG', payload: entry });
    },

    complete: (summary: { passed: number; failed: number; errors: number }) => {
      // Flush any pending batched updates before completing
      batcher.cleanup();
      dispatch({ type: 'COMPLETE', payload: summary });
    },

    error: (message: string) => {
      // Cleanup on error too
      batcher.cleanup();
      dispatch({ type: 'ERROR', payload: { message } });
    },

    setPhase: (phase: 'loading' | 'evaluating' | 'grading' | 'completed' | 'error') => {
      dispatch({ type: 'SET_PHASE', payload: phase });
    },

    setShareUrl: (url: string) => {
      dispatch({ type: 'SET_SHARE_URL', payload: url });
    },

    setSharingStatus: (status: SharingStatus, url?: string) => {
      dispatch({ type: 'SET_SHARING_STATUS', payload: { status, url } });
    },

    setSessionPhase: (phase: SessionPhase) => {
      dispatch({ type: 'SET_SESSION_PHASE', payload: phase });
    },

    showResults: (tableData: EvaluateTable) => {
      dispatch({ type: 'SET_TABLE_DATA', payload: tableData });
      dispatch({ type: 'SET_SESSION_PHASE', payload: 'results' });
    },

    cleanup: () => {
      batcher.cleanup();
    },
  };
}

/**
 * Extract provider IDs from evaluate options and test suite.
 */
export function extractProviderIds(
  providers: Array<{ id: () => string; label?: string }>,
): string[] {
  return providers.map((p) => p.label || p.id());
}

/**
 * Create evaluate options with the Ink UI progress callback.
 *
 * This function wraps existing evaluate options to include the Ink UI progress callback
 * while preserving any existing callback.
 *
 * @param options - Original evaluate options
 * @param dispatch - The dispatch function from EvalContext
 * @returns Modified evaluate options with Ink UI integration
 */
export function wrapEvaluateOptions(
  options: EvaluateOptions,
  dispatch: React.Dispatch<EvalAction>,
): EvaluateOptions {
  const originalCallback = options.progressCallback;
  const inkCallback = createProgressCallback(dispatch);

  return {
    ...options,
    progressCallback: (
      completed: number,
      total: number,
      index: number,
      evalStep?: RunEvalOptions,
      metrics?: PromptMetrics,
    ) => {
      // Call the Ink UI callback
      inkCallback(completed, total, index, evalStep, metrics);

      // Also call the original callback if it exists
      // Note: The evaluator may pass undefined for evalStep during comparison steps
      if (originalCallback) {
        originalCallback(
          completed,
          total,
          index,
          evalStep as RunEvalOptions,
          metrics as PromptMetrics,
        );
      }
    },
  };
}
