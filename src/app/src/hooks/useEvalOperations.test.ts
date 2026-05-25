import { callApiJson, callApiResult } from '@app/utils/api';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEvalOperations } from './useEvalOperations';
import type { Trace } from '@app/components/traces/TraceView';
import type { ReplayEvaluationParams } from '@app/pages/eval/components/EvalOutputPromptDialog';

vi.mock('@app/utils/api');

describe('useEvalOperations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('replayEvaluation', () => {
    let params: ReplayEvaluationParams;
    let result: { current: ReturnType<typeof useEvalOperations> };

    beforeEach(() => {
      params = {
        evaluationId: 'eval-xyz-789',
        prompt: 'Can you replay this prompt?',
        testIndex: 1,
      };

      result = renderHook(() => useEvalOperations()).result;
    });

    const setupApiMock = (response: { ok: boolean; data?: unknown; error?: string }) => {
      vi.mocked(callApiResult).mockResolvedValue(
        response.ok
          ? ({ ok: true, data: response.data } as any)
          : ({ ok: false, error: { message: response.error ?? '' } } as any),
      );
    };

    const verifyApiCall = () => {
      expect(callApiResult).toHaveBeenCalledTimes(1);
    };

    it('should return an object with the output property from the API response when the API call is successful', async () => {
      const mockOutput = 'This is the replayed output from the API.';
      setupApiMock({
        ok: true,
        data: { output: mockOutput },
      });

      let replayResult;
      await act(async () => {
        replayResult = await result.current.replayEvaluation(params);
      });

      expect(replayResult).toEqual({ output: mockOutput });
      verifyApiCall();
    });

    it('should return an object with the error property formatted as "Provider error: [error message]" when the API returns a successful response but the data contains an error field', async () => {
      const mockErrorMessage = 'Failed to process the request.';
      setupApiMock({
        ok: true,
        data: { output: '', error: mockErrorMessage },
      });

      let replayResult;
      await act(async () => {
        replayResult = await result.current.replayEvaluation(params);
      });

      expect(replayResult).toEqual({ error: `Provider error: ${mockErrorMessage}` });
      verifyApiCall();
    });

    it("should return an error object with the message 'Failed to replay evaluation' when the API returns a non-ok response with an empty response text", async () => {
      setupApiMock({
        ok: false,
        error: '',
      });

      let replayResult;
      await act(async () => {
        replayResult = await result.current.replayEvaluation(params);
      });

      expect(replayResult).toEqual({ error: 'Failed to replay evaluation' });
      verifyApiCall();
    });

    it('should return an object with an error property when the API call is aborted', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      vi.mocked(callApiResult).mockRejectedValue(abortError);

      let replayResult;
      await act(async () => {
        replayResult = await result.current.replayEvaluation(params);
      });

      expect(replayResult).toEqual({ error: 'The operation was aborted' });
      verifyApiCall();
    });

    it('should return an error object when evaluationId is an empty string', async () => {
      vi.mocked(callApiResult).mockRejectedValue(new Error('Network error'));

      params.evaluationId = '';

      let replayResult;
      await act(async () => {
        replayResult = await result.current.replayEvaluation(params);
      });

      expect(replayResult).toEqual({ error: 'Network error' });
    });
  });

  describe('fetchTraces', () => {
    it('should return an array of Trace objects from the API response when the API call is successful and the response contains a valid traces array', async () => {
      const mockTraces: Trace[] = [
        { traceId: 'trace-1', testCaseId: 'test-1' },
        { traceId: 'trace-2', testCaseId: 'test-2' },
      ];
      vi.mocked(callApiJson).mockResolvedValue({ traces: mockTraces });

      const { result } = renderHook(() => useEvalOperations());
      const evalId = 'eval-123';
      const abortController = new AbortController();

      let traces: Trace[] = [];
      await act(async () => {
        traces = await result.current.fetchTraces(evalId, abortController.signal);
      });

      expect(traces).toEqual(mockTraces);
      expect(callApiJson).toHaveBeenCalledTimes(1);
    });

    it('should return an empty array when the API response is successful but does not contain a traces array', async () => {
      vi.mocked(callApiJson).mockResolvedValue({ traces: [] });

      const { result } = renderHook(() => useEvalOperations());

      const signal = new AbortController().signal;
      let traces;
      await act(async () => {
        traces = await result.current.fetchTraces('eval-123', signal);
      });

      expect(traces).toEqual([]);
      expect(callApiJson).toHaveBeenCalledTimes(1);
    });

    it('should throw an error when the API response is not OK', async () => {
      vi.mocked(callApiJson).mockRejectedValue(new Error('HTTP error! status: 404'));

      const { result } = renderHook(() => useEvalOperations());

      const signal = new AbortController().signal;
      await expect(result.current.fetchTraces('eval-id', signal)).rejects.toThrowError(
        'HTTP error! status: 404',
      );
      expect(callApiJson).toHaveBeenCalledTimes(1);
    });

    it.each([
      400, 404, 500,
    ])('should throw an error with the correct status code when the API call returns an HTTP error (status %s)', async (statusCode) => {
      vi.mocked(callApiJson).mockRejectedValue(new Error(`HTTP error! status: ${statusCode}`));

      const { result } = renderHook(() => useEvalOperations());

      await expect(
        result.current.fetchTraces('test-eval-id', new AbortController().signal),
      ).rejects.toThrowError(`HTTP error! status: ${statusCode}`);
      expect(callApiJson).toHaveBeenCalledTimes(1);
    });

    it('should handle AbortError when the API call is aborted', async () => {
      const abortController = new AbortController();
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      vi.mocked(callApiJson).mockRejectedValue(abortError);

      const { result } = renderHook(() => useEvalOperations());

      let error;
      await act(async () => {
        try {
          await result.current.fetchTraces('test-eval-id', abortController.signal);
        } catch (e) {
          error = e;
        }
      });

      expect(callApiJson).toHaveBeenCalledTimes(1);
      expect(error).toEqual(abortError);
    });
  });
});
