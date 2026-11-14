import { describe, expect, it, vi } from 'vitest';
import { retryGeminiGeneration } from '../../../src/providers/google/generationRetry';

const options = { timeoutMs: 5_000, baseRetryDelay: 0 };
const output = { candidates: [{ content: { parts: [{ text: 'answer' }] }, finishReason: 'STOP' }] };

describe('retryGeminiGeneration', () => {
  it('retries a successful empty response once and records both requests', async () => {
    const deleteFromCache = vi.fn().mockResolvedValue(undefined);
    const request = vi
      .fn()
      .mockResolvedValueOnce({ data: { candidates: [] }, deleteFromCache })
      .mockResolvedValueOnce({ data: output });
    const result = await retryGeminiGeneration(options, request);
    expect(result).toEqual({ response: { data: output }, requests: 2 });
    expect(deleteFromCache).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][0]).toBe(request.mock.calls[1][0]);
    expect(request.mock.calls.map((call) => call[1])).toEqual([false, true]);
  });

  it.each([
    ['safety feedback', { candidates: [], promptFeedback: { blockReason: 'SAFETY' } }],
    ['terminal finish', { candidates: [{ finishReason: 'MAX_TOKENS' }] }],
    ['reported usage', { candidates: [], usageMetadata: { totalTokenCount: 10 } }],
    ['provider error', { candidates: [], error: { code: 503 } }],
    ['stream with a partial result', [output, { error: { code: 503 } }]],
    ['unrecognized body', {}],
    ['ordinary result', output],
  ])('preserves %s without repeating the request', async (_reason, data) => {
    const request = vi.fn().mockResolvedValue({ data });
    await expect(retryGeminiGeneration(options, request)).resolves.toEqual({
      response: { data },
      requests: 1,
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([
    { maxRetries: 0 },
    { streaming: true },
    { tools: [{ codeExecution: {} }] },
    { hasCallbacks: true },
  ])('honors disabled retries for the effective request (%j)', async (overrides) => {
    const request = vi.fn().mockResolvedValue({ data: { candidates: [] } });
    await retryGeminiGeneration({ ...options, ...overrides }, request);
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([false, true])('retries explicit HTTP 503 (thrown: %s)', async (thrown) => {
    const first = { status: 503, data: { error: { code: 503 } } };
    const request = vi.fn().mockResolvedValue({ data: output });
    if (thrown) {
      request.mockRejectedValueOnce({ response: first });
    } else {
      request.mockResolvedValueOnce(first);
    }
    const result = await retryGeminiGeneration(options, request);
    expect(result).toEqual({ response: { data: output }, requests: 2 });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('uses the explicit retry budget and preserves the final response when exhausted', async () => {
    const request = vi.fn().mockResolvedValue({ status: 503 });
    const result = await retryGeminiGeneration({ ...options, maxRetries: 2 }, request);
    expect(result).toEqual({ response: { status: 503 }, requests: 3 });
    expect(request.mock.calls.map((call) => call[1])).toEqual([false, true, true]);
  });

  it('preserves an explicit authentication failure', async () => {
    const response = { status: 401, data: { candidates: [] } };
    const request = vi.fn().mockResolvedValue(response);
    await expect(retryGeminiGeneration(options, request)).resolves.toEqual({
      response,
      requests: 1,
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it('leaves transport failures to the existing transport retry policy', async () => {
    const error = new Error('HTTP 503');
    const request = vi.fn().mockRejectedValue(error);
    await expect(retryGeminiGeneration(options, request)).rejects.toBe(error);
    expect(request).toHaveBeenCalledOnce();
  });

  it('does not start the second request after caller cancellation', async () => {
    const controller = new AbortController();
    const request = vi.fn().mockImplementation(async () => {
      controller.abort(new Error('cancelled'));
      return { data: { candidates: [] } };
    });
    await expect(
      retryGeminiGeneration({ ...options, signal: controller.signal }, request),
    ).rejects.toThrow('cancelled');
    expect(request).toHaveBeenCalledOnce();
  });
});
