import { useCallback } from 'react';

import {
  ApiRoutes,
  callApiJson,
  callApiResult,
  EvalResponseSchemas,
  TracesSchemas,
} from '@app/utils/api';
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
        const response = await callApiResult(
          ApiRoutes.Eval.Replay,
          EvalResponseSchemas.Replay.Response,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(params),
          },
        );

        if (!response.ok) {
          return { error: response.error.message || 'Failed to replay evaluation' };
        }

        const data = response.data;

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
    const data = await callApiJson(ApiRoutes.Traces.GetByEval, TracesSchemas.GetByEval.Response, {
      params: { evaluationId: evalId },
      signal,
    });
    return Array.isArray(data.traces) ? (data.traces as unknown as Trace[]) : [];
  }, []);

  return {
    replayEvaluation,
    fetchTraces,
  };
}
