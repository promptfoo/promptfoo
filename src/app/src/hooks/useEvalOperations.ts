import { useCallback } from 'react';

import { callApi } from '@app/utils/api';
import type { Trace } from '@app/components/traces/TraceView';
import type {
  ReplayEvaluationParams,
  ReplayEvaluationResult,
} from '@app/pages/eval/components/EvalOutputPromptDialog';

/**
 * Parameters for replaying an entire row (all providers).
 */
export interface ReplayRowParams {
  evaluationId: string;
  testIndex: number;
  variables?: Record<string, unknown>;
}

/**
 * Individual output result from row replay.
 */
export interface ReplayRowOutput {
  promptIndex?: number;
  output: string;
  error?: string;
  pass?: boolean;
  score?: number;
}

/**
 * Result from row replay operation.
 */
export interface ReplayRowResult {
  success?: boolean;
  testIndex?: number;
  outputs?: ReplayRowOutput[];
  resultCount?: number;
  error?: string;
}

/**
 * Custom hook that provides eval-related API operations.
 * Separates API logic from presentational components.
 */
export function useEvalOperations() {
  const replayEvaluation = useCallback(
    async (params: ReplayEvaluationParams): Promise<ReplayEvaluationResult> => {
      try {
        const response = await callApi('/eval/replay', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params),
        });

        if (!response.ok) {
          const error = await response.text();
          return { error: error || 'Failed to replay evaluation' };
        }

        const data = await response.json();

        if (data.error) {
          return { error: `Provider error: ${data.error}` };
        }

        return { output: data.output || undefined };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'An error occurred' };
      }
    },
    [],
  );

  const fetchTraces = useCallback(async (evalId: string, signal: AbortSignal): Promise<Trace[]> => {
    const response = await callApi(`/traces/evaluation/${evalId}`, {
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data.traces) ? data.traces : [];
  }, []);

  /**
   * Replay an entire row (all providers) for a single test case.
   */
  const replayRow = useCallback(async (params: ReplayRowParams): Promise<ReplayRowResult> => {
    try {
      const response = await callApi('/eval/replay-row', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const error = await response.text();
        return { error: error || 'Failed to replay row' };
      }

      const data = await response.json();

      if (data.error) {
        return { error: data.error };
      }

      return {
        success: data.success,
        testIndex: data.testIndex,
        outputs: data.outputs,
        resultCount: data.resultCount,
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'An error occurred' };
    }
  }, []);

  return {
    replayEvaluation,
    replayRow,
    fetchTraces,
  };
}
