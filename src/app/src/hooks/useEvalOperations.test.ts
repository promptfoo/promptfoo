import { callApi } from '@app/utils/api';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
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

    const setupApiMock = (response: Partial<Response>) => {
      vi.mocked(callApi).mockResolvedValue(response as Response);
    };

    const verifyApiCall = () => {
      expect(callApi).toHaveBeenCalledTimes(1);
      expect(callApi).toHaveBeenCalledWith('/eval/replay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });
    };

    it('should return an object with the output property from the API response when the API call is successful', async () => {
      const mockOutput = 'This is the replayed output from the API.';
      setupApiMock({
        ok: true,
        json: async () => ({ output: mockOutput }),
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
        json: async () => ({ error: mockErrorMessage }),
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
        text: async () => '',
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

      vi.mocked(callApi).mockRejectedValue(abortError);

      let replayResult;
      await act(async () => {
        replayResult = await result.current.replayEvaluation(params);
      });

      expect(replayResult).toEqual({ error: 'The operation was aborted' });
      verifyApiCall();
    });

    it('should return an error object when evaluationId is an empty string', async () => {
      (callApi as Mock).mockRejectedValue(new Error('Network error'));

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
      const mockApiResponse = {
        ok: true,
        json: async () => ({ traces: mockTraces }),
      } as Response;

      vi.mocked(callApi).mockResolvedValue(mockApiResponse);

      const { result } = renderHook(() => useEvalOperations());
      const evalId = 'eval-123';
      const abortController = new AbortController();

      let traces: Trace[] = [];
      await act(async () => {
        traces = await result.current.fetchTraces(evalId, abortController.signal);
      });

      expect(traces).toEqual(mockTraces);
      expect(callApi).toHaveBeenCalledTimes(1);
      expect(callApi).toHaveBeenCalledWith(`/traces/evaluation/${evalId}`, {
        signal: abortController.signal,
      });
    });

    it('should return an empty array when the API response is successful but does not contain a traces array', async () => {
      const mockApiResponse = {
        ok: true,
        json: async () => ({}),
      } as Response;

      vi.mocked(callApi).mockResolvedValue(mockApiResponse);

      const { result } = renderHook(() => useEvalOperations());

      const signal = new AbortController().signal;
      let traces;
      await act(async () => {
        traces = await result.current.fetchTraces('eval-123', signal);
      });

      expect(traces).toEqual([]);
      expect(callApi).toHaveBeenCalledTimes(1);
      expect(callApi).toHaveBeenCalledWith('/traces/evaluation/eval-123', {
        signal,
      });
    });

    it('should throw an error when the API response is not OK', async () => {
      const mockStatus = 404;
      const mockApiResponse = {
        ok: false,
        status: mockStatus,
      } as Response;

      vi.mocked(callApi).mockResolvedValue(mockApiResponse);

      const { result } = renderHook(() => useEvalOperations());

      const signal = new AbortController().signal;
      await expect(result.current.fetchTraces('eval-id', signal)).rejects.toThrowError(
        `HTTP error! status: ${mockStatus}`,
      );
      expect(callApi).toHaveBeenCalledTimes(1);
      expect(callApi).toHaveBeenCalledWith('/traces/evaluation/eval-id', {
        signal,
      });
    });

    it.each([
      400, 404, 500,
    ])('should throw an error with the correct status code when the API call returns an HTTP error (status %s)', async (statusCode) => {
      vi.mocked(callApi).mockResolvedValue({
        ok: false,
        status: statusCode,
      } as Response);

      const { result } = renderHook(() => useEvalOperations());

      await expect(
        result.current.fetchTraces('test-eval-id', new AbortController().signal),
      ).rejects.toThrowError(`HTTP error! status: ${statusCode}`);
      expect(callApi).toHaveBeenCalledTimes(1);
      expect(callApi).toHaveBeenCalledWith('/traces/evaluation/test-eval-id', {
        signal: expect.any(AbortSignal),
      });
    });

    it('should handle AbortError when the API call is aborted', async () => {
      const abortController = new AbortController();
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      vi.mocked(callApi).mockRejectedValue(abortError);

      const { result } = renderHook(() => useEvalOperations());

      let error;
      await act(async () => {
        try {
          await result.current.fetchTraces('test-eval-id', abortController.signal);
        } catch (e) {
          error = e;
        }
      });

      expect(callApi).toHaveBeenCalledTimes(1);
      expect(callApi).toHaveBeenCalledWith('/traces/evaluation/test-eval-id', {
        signal: abortController.signal,
      });
      expect(error).toEqual(abortError);
    });
  });
});
