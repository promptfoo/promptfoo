import { useCallback } from 'react';

import { callApi } from '@app/utils/api';
import type { Trace } from '@app/components/traces/TraceView';
import type {
  ReplayEvaluationParams,
  ReplayEvaluationResult,
} from '@app/pages/eval/components/EvalOutputPromptDialog';

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

  return {
    replayEvaluation,
    fetchTraces,
  };
}
