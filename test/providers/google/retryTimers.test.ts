import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createGeminiRetrySignal,
  getGeminiErrorHeaders,
  getGeminiErrorStatusText,
  getGeminiMaxRetries,
  getGeminiRetryAfterMs,
  getGeminiRetryDelay,
  isGeminiHardQuotaError,
  isGeminiRetryableError,
  isGeminiRetryableHttpResponse,
  isGeminiRetryableResponseData,
  isGeminiRetryableStatus,
  waitBeforeGeminiRetry,
} from '../../../src/providers/google/retry';

describe('Gemini retry policy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('uses the documented status allowlist and bounded attempt count', () => {
    expect([408, 429, 500, 502, 503, 504].every(isGeminiRetryableStatus)).toBe(true);
    expect(isGeminiRetryableStatus(501)).toBe(false);
    expect(isGeminiRetryableStatus(505)).toBe(false);
    expect(
      isGeminiRetryableHttpResponse(429, {
        error: {
          details: [
            {
              violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }],
            },
          ],
        },
      }),
    ).toBe(false);
    expect(getGeminiMaxRetries({ maxRetries: 100 })).toBe(100);
    expect(getGeminiMaxRetries({ maxRetries: 0 })).toBe(0);
  });

  it('recognizes only valid structural rate-limit errors from custom transports', () => {
    const permanentError = Object.assign(new Error('Unauthorized'), {
      name: 'HttpRateLimitError',
      status: 401,
      statusText: 'Unauthorized',
      kind: 'rate_limit',
    });
    const malformedError = Object.assign(new Error('Malformed'), {
      name: 'HttpRateLimitError',
      status: 429,
      statusText: 17,
      kind: 'quota',
    });
    const validRateLimitError = Object.assign(new Error('Rate limited'), {
      name: 'HttpRateLimitError',
      status: 429,
      statusText: 'Too Many Requests',
      kind: 'rate_limit',
      retryAfterMs: 1000,
    });

    expect(isGeminiRetryableError(permanentError)).toBe(false);
    expect(isGeminiRetryableError(malformedError)).toBe(true);
    expect(getGeminiErrorStatusText(malformedError)).toBe('Unknown Error');
    expect(isGeminiHardQuotaError(malformedError)).toBe(false);
    expect(isGeminiRetryableError(validRateLimitError)).toBe(true);
  });

  it('caps local exponential backoff but never shortens Retry-After', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);

    expect(getGeminiRetryDelay({ baseRetryDelay: 60_000 }, 10)).toBe(60_000);
    expect(getGeminiRetryDelay({ baseRetryDelay: 1 }, 0, 120_000)).toBe(144_000);
    expect(
      getGeminiRetryAfterMs(
        new Response(null, {
          headers: {
            'retry-after': '7',
            'retry-after-ms': '2500',
            'set-cookie': 'session=secret',
          },
        }),
      ),
    ).toBe(2500);
    expect(
      getGeminiErrorHeaders(
        new Response(null, {
          headers: { 'retry-after': '7', 'set-cookie': 'session=secret' },
        }),
      ),
    ).toEqual({ 'retry-after': '7' });
    expect(
      getGeminiRetryAfterMs(undefined, [
        {
          error: {
            details: [
              {
                '@type': 'type.googleapis.com/google.rpc.RetryInfo',
                retryDelay: '3.5s',
              },
            ],
          },
        },
      ]),
    ).toBe(3500);
  });

  it('cancels a pending retry timer without leaving it scheduled', async () => {
    const controller = new AbortController();
    const pending = waitBeforeGeminiRetry(
      { baseRetryDelay: 10_000 },
      0,
      3,
      undefined,
      controller.signal,
    );

    expect(vi.getTimerCount()).toBe(1);
    controller.abort(new DOMException('cancelled', 'AbortError'));

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('chunks delays above the Node timer limit instead of retrying immediately', async () => {
    const controller = new AbortController();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const pending = waitBeforeGeminiRetry(
      { baseRetryDelay: 1 },
      0,
      3,
      2_147_483_648,
      controller.signal,
    );

    expect(vi.getTimerCount()).toBe(1);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2_147_483_647);
    controller.abort(new DOMException('cancelled', 'AbortError'));

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBe(0);
    setTimeoutSpy.mockRestore();
  });

  it('uses one timeout budget for the request and all retry waits', async () => {
    const signal = createGeminiRetrySignal(undefined, 100);
    const pending = waitBeforeGeminiRetry({ baseRetryDelay: 10_000 }, 0, 3, undefined, signal);

    await vi.advanceTimersByTimeAsync(100);

    await expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('treats terminal responses as authoritative and scans complete streams', () => {
    expect(
      isGeminiRetryableResponseData({
        candidates: [{ finishReason: 'MALFORMED_FUNCTION_CALL', content: { parts: [] } }],
      } as any),
    ).toBe(false);
    expect(
      isGeminiRetryableResponseData({
        candidates: [{ finishReason: 'MODEL_ARMOR', content: { parts: [] } }],
      } as any),
    ).toBe(false);
    expect(
      isGeminiRetryableResponseData({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '' }] } }],
      } as any),
    ).toBe(true);
    expect(
      isGeminiRetryableResponseData([
        { candidates: [] },
        { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'done' }] } }] },
      ] as any),
    ).toBe(false);
    expect(isGeminiRetryableResponseData(null as any)).toBe(true);
    expect(
      isGeminiRetryableResponseData({
        candidates: [{ finishReason: 'STOP', content: { parts: [null] } }],
      } as any),
    ).toBe(true);
    expect(isGeminiRetryableResponseData({ candidates: [null] } as any)).toBe(true);
    expect(
      isGeminiRetryableResponseData({
        candidates: [
          {
            finishReason: 'STOP',
            content: { parts: [] },
            safetyRatings: [{ blocked: true, probability: 'HIGH' }],
          },
        ],
      } as any),
    ).toBe(false);
    expect(
      isGeminiRetryableResponseData({
        promptFeedback: { safetyRatings: [{ blocked: false, probability: 'HIGH' }] },
        candidates: [],
      } as any),
    ).toBe(true);
  });
});
