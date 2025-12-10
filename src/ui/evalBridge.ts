/**
 * Bridge between the evaluator and the Ink UI.
 *
 * This module provides the connection between the evaluator's progress callbacks
 * and the React state management in the Ink UI.
 */

import type { EvaluateOptions, PromptMetrics, RunEvalOptions } from '../types/index';
import type { EvalAction } from './contexts/EvalContext';

/**
 * Format variables for display in the UI.
 */
function formatVarsForDisplay(vars: Record<string, unknown> | undefined, maxLength: number): string {
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
  return (
    completed: number,
    total: number,
    index: number,
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

    const provider = evalStep.provider.label || evalStep.provider.id();
    const prompt = evalStep.prompt.raw.slice(0, 50).replace(/\n/g, ' ');
    const vars = formatVarsForDisplay(evalStep.test.vars, 50);

    // Determine if this is a pass/fail based on metrics
    let passed: boolean | undefined;
    let error: string | undefined;

    if (metrics) {
      passed = metrics.testPassCount > 0 && metrics.testFailCount === 0;
      if (metrics.testErrorCount > 0) {
        error = 'Test error';
      }
    }

    dispatch({
      type: 'PROGRESS',
      payload: {
        completed,
        total,
        provider,
        prompt,
        vars,
        passed,
        error,
      },
    });

    // Also update provider status
    dispatch({
      type: 'PROVIDER_UPDATE',
      payload: {
        providerId: provider,
        status: 'running',
        currentTest: vars,
        ...(error && { error }),
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
  addError: (provider: string, prompt: string, message: string, vars?: Record<string, unknown>) => void;
  /** Mark evaluation as complete */
  complete: (summary: { passed: number; failed: number; errors: number }) => void;
  /** Mark evaluation as errored */
  error: (message: string) => void;
  /** Set the current phase */
  setPhase: (phase: 'loading' | 'evaluating' | 'grading' | 'completed' | 'error') => void;
}

/**
 * Creates a UI controller that wraps dispatch for easier use from non-React code.
 *
 * @param dispatch - The dispatch function from EvalContext
 * @returns An EvalUIController object
 */
export function createEvalUIController(
  dispatch: React.Dispatch<EvalAction>,
): EvalUIController {
  return {
    init: (totalTests: number, providers: string[]) => {
      dispatch({ type: 'INIT', payload: { totalTests, providers } });
    },

    start: () => {
      dispatch({ type: 'START' });
    },

    progress: createProgressCallback(dispatch),

    addError: (provider: string, prompt: string, message: string, vars?: Record<string, unknown>) => {
      dispatch({ type: 'ADD_ERROR', payload: { provider, prompt, message, vars } });
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
        originalCallback(completed, total, index, evalStep as RunEvalOptions, metrics as PromptMetrics);
      }
    },
  };
}
