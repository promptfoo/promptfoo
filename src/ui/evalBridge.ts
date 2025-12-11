/**
 * Bridge between the evaluator and the Ink UI.
 *
 * This module provides the connection between the evaluator's progress callbacks
 * and the React state management in the Ink UI.
 */

import type { EvaluateOptions, PromptMetrics, RunEvalOptions } from '../types/index';
import type { TokenUsage } from '../types/shared';
import { TokenUsageTracker } from '../util/tokenUsage';
import type { EvalAction, LogEntry, SharingStatus, TokenMetricsPayload } from './contexts/EvalContext';

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
 * Convert TokenUsage to TokenMetricsPayload for dispatch.
 */
function tokenUsageToPayload(usage: TokenUsage | undefined): TokenMetricsPayload {
  return {
    prompt: usage?.prompt ?? 0,
    completion: usage?.completion ?? 0,
    cached: usage?.cached ?? 0,
    total: usage?.total ?? 0,
    numRequests: usage?.numRequests ?? 0,
    reasoning: usage?.completionDetails?.reasoning ?? 0,
  };
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
 * from the aggregate PromptMetrics, and integrates with TokenUsageTracker
 * for real-time token usage updates.
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
    const promptIdx = (evalStep as { promptIdx?: number }).promptIdx ?? 0;
    // Create a unique key for this provider+prompt combination
    const trackingKey = `${providerId}:${promptIdx}`;

    // The TokenUsageTracker uses a tracking ID that includes the constructor name
    // e.g., "openai:gpt-4o-mini (OpenAiGenericProvider)"
    const provider = evalStep.provider as unknown as { constructor?: { name?: string } };
    const tokenTrackingId = provider.constructor?.name
      ? `${evalStep.provider.id()} (${provider.constructor.name})`
      : evalStep.provider.id();

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

      // Dispatch TEST_RESULT for per-provider metrics (aggregates across prompts)
      dispatch({
        type: 'TEST_RESULT',
        payload: {
          providerId,
          passed: testPassed,
          failed: testFailed,
          error: testError,
          latencyMs,
          cost,
        },
      });

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

    // Get token usage from TokenUsageTracker for this provider
    // Use the tokenTrackingId that matches the format used by the evaluator
    const tracker = TokenUsageTracker.getInstance();
    const tokenUsage = tracker.getProviderUsage(tokenTrackingId);
    if (tokenUsage) {
      dispatch({
        type: 'UPDATE_TOKEN_METRICS',
        payload: {
          providerId,
          tokenUsage: tokenUsageToPayload(tokenUsage),
        },
      });
    }

    // Dispatch basic progress update (for current activity display)
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
      },
    });

    // Update provider status
    dispatch({
      type: 'PROVIDER_UPDATE',
      payload: {
        providerId,
        status: 'running',
        currentTest: vars,
        ...(testError && { error: 'Test error' }),
      },
    });
  };
}

/**
 * Interface for the eval UI controller.
 */
export interface EvalUIController {
  /** Initialize the UI with evaluation parameters */
  init: (totalTests: number, providers: string[]) => void;
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
}

/**
 * Creates a UI controller that wraps dispatch for easier use from non-React code.
 *
 * @param dispatch - The dispatch function from EvalContext
 * @returns An EvalUIController object
 */
export function createEvalUIController(dispatch: React.Dispatch<EvalAction>): EvalUIController {
  return {
    init: (totalTests: number, providers: string[]) => {
      dispatch({ type: 'INIT', payload: { totalTests, providers } });
    },

    start: () => {
      dispatch({ type: 'START' });
    },

    progress: createProgressCallback(dispatch),

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
      dispatch({ type: 'COMPLETE', payload: summary });
    },

    error: (message: string) => {
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
