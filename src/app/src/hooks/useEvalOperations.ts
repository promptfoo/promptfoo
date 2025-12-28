import { useCallback } from 'react';

import { ApiRequestError, callApiTyped } from '@app/utils/apiClient';
import type { Trace } from '@app/components/traces/TraceView';
import type {
  ReplayEvaluationParams,
  ReplayEvaluationResult,
} from '@app/pages/eval/components/EvalOutputPromptDialog';
import type { GetTracesByEvaluationResponse, ReplayResponse } from '@promptfoo/dtos';

/**
 * Custom hook that provides eval-related API operations.
 * Separates API logic from presentational components.
 */
export function useEvalOperations() {
  const replayEvaluation = useCallback(
    async (params: ReplayEvaluationParams): Promise<ReplayEvaluationResult> => {
      try {
        const data = await callApiTyped<ReplayResponse>('/eval/replay', {
          method: 'POST',
          body: params,
        });

        if (data.error) {
          return { error: `Provider error: ${data.error}` };
        }

        return { output: data.output || undefined };
      } catch (error) {
        if (error instanceof ApiRequestError) {
          return { error: error.body || 'Failed to replay evaluation' };
        }
        return { error: error instanceof Error ? error.message : 'An error occurred' };
      }
    },
    [],
  );

  const fetchTraces = useCallback(async (evalId: string, signal: AbortSignal): Promise<Trace[]> => {
    const data = await callApiTyped<GetTracesByEvaluationResponse>(`/traces/evaluation/${evalId}`, {
      signal,
    });
    return Array.isArray(data.traces) ? data.traces : [];
  }, []);

  return {
    replayEvaluation,
    fetchTraces,
  };
}
