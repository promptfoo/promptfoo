import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../src/cache';
import { getUserEmail } from '../src/globalConfig/accounts';
import { getRequestTimeoutMs } from '../src/providers/shared';
import {
  getRemoteGenerationHeaders,
  getRemoteGenerationUrl,
} from '../src/redteam/remoteGeneration';
import { doRemoteGrading } from '../src/remoteGrading';
import { getActiveTraceparent } from '../src/tracing/spanRoles';

const mockLoggerDebug = vi.hoisted(() => vi.fn());

function containsString(value: unknown, needle: string): boolean {
  if (typeof value === 'string') {
    return value.includes(needle);
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsString(item, needle));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some((item) => containsString(item, needle));
  }
  return false;
}

vi.mock('../src/cache', () => ({
  fetchWithCache: vi.fn(),
}));

vi.mock('../src/globalConfig/accounts', () => ({
  getUserEmail: vi.fn(),
}));

vi.mock('../src/providers/shared', () => ({
  getRequestTimeoutMs: vi.fn(),
}));

vi.mock('../src/redteam/remoteGeneration', () => ({
  getRemoteGenerationHeaders: vi.fn(),
  getRemoteGenerationUrl: vi.fn(),
}));

vi.mock('../src/logger', () => ({
  default: {
    debug: mockLoggerDebug,
  },
}));

vi.mock('../src/tracing/spanRoles', () => ({
  getActiveTraceparent: vi.fn(),
}));

describe('doRemoteGrading', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('preserves grader error metadata from remote grading results', async () => {
    vi.mocked(getUserEmail).mockReturnValue('user@example.com');
    vi.mocked(getRemoteGenerationUrl).mockReturnValue('https://api.promptfoo.test/task');
    vi.mocked(getRemoteGenerationHeaders).mockReturnValue({ authorization: 'Bearer test' });
    vi.mocked(getRequestTimeoutMs).mockReturnValue(1234);
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        result: {
          pass: false,
          score: 0,
          reason: 'API error: 429 Too Many Requests',
          metadata: { graderError: true },
        },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    const result = await doRemoteGrading({
      task: 'llm-rubric',
      rubric: 'Only pass if the response is correct.',
      output: 'Example output',
      vars: {},
    });

    expect(result).toMatchObject({
      pass: false,
      score: 0,
      reason: 'API error: 429 Too Many Requests',
      metadata: { graderError: true },
    });
    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://api.promptfoo.test/task',
      expect.objectContaining({
        method: 'POST',
        headers: { authorization: 'Bearer test' },
      }),
      1234,
    );
  });

  it('does not add grader error metadata when remote grading succeeds without metadata', async () => {
    vi.mocked(getUserEmail).mockReturnValue('user@example.com');
    vi.mocked(getRemoteGenerationUrl).mockReturnValue('https://api.promptfoo.test/task');
    vi.mocked(getRemoteGenerationHeaders).mockReturnValue({ authorization: 'Bearer test' });
    vi.mocked(getRequestTimeoutMs).mockReturnValue(1234);
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        result: {
          pass: true,
          score: 1,
          reason: 'ok',
        },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    const result = await doRemoteGrading({
      task: 'llm-rubric',
      rubric: 'Only pass if the response is correct.',
      output: 'Example output',
      vars: {},
    });

    expect(result).toMatchObject({
      pass: true,
      score: 1,
      reason: 'ok',
    });
    expect(result.metadata?.graderError).toBeUndefined();
  });

  it('counts one remote grading task while preserving usage from all internal model calls', async () => {
    vi.mocked(getUserEmail).mockReturnValue('user@example.com');
    vi.mocked(getRemoteGenerationUrl).mockReturnValue('https://api.promptfoo.test/task');
    vi.mocked(getRemoteGenerationHeaders).mockReturnValue({ authorization: 'Bearer test' });
    vi.mocked(getRequestTimeoutMs).mockReturnValue(1234);
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        result: {
          pass: true,
          score: 1,
          reason: 'Grading task passed after multiple model calls',
          tokensUsed: {
            total: 97,
            prompt: 61,
            completion: 36,
            numRequests: 4,
            completionDetails: { reasoning: 13 },
          },
        },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    const result = await doRemoteGrading({ task: 'llm-rubric', output: 'Example output' });

    expect(result.tokensUsed).toEqual({
      total: 97,
      prompt: 61,
      completion: 36,
      numRequests: 1,
      completionDetails: { reasoning: 13 },
    });
  });

  it('does not count a cached remote grading result as a new grading-task request', async () => {
    vi.mocked(getUserEmail).mockReturnValue('user@example.com');
    vi.mocked(getRemoteGenerationUrl).mockReturnValue('https://api.promptfoo.test/task');
    vi.mocked(getRemoteGenerationHeaders).mockReturnValue({ authorization: 'Bearer test' });
    vi.mocked(getRequestTimeoutMs).mockReturnValue(1234);
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        result: {
          pass: true,
          score: 1,
          reason: 'Cached grading result',
          tokensUsed: { total: 97, prompt: 61, completion: 36, numRequests: 4 },
        },
      },
      cached: true,
      status: 200,
      statusText: 'OK',
    } as any);

    const result = await doRemoteGrading({ task: 'llm-rubric', output: 'Example output' });

    expect(result.tokensUsed).toEqual({ total: 97, cached: 97, numRequests: 0 });
  });

  it('propagates the active grader traceparent to remote grading requests', async () => {
    const traceparent = '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01';
    vi.mocked(getActiveTraceparent).mockReturnValue(traceparent);
    vi.mocked(getUserEmail).mockReturnValue('user@example.com');
    vi.mocked(getRemoteGenerationUrl).mockReturnValue('https://api.promptfoo.test/task');
    vi.mocked(getRemoteGenerationHeaders).mockImplementation((extraHeaders) => ({
      authorization: 'Bearer test',
      ...extraHeaders,
    }));
    vi.mocked(getRequestTimeoutMs).mockReturnValue(1234);
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: { result: { pass: true, score: 1, reason: 'ok' } },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    await doRemoteGrading({ task: 'llm-rubric', output: 'Example output' });

    expect(getRemoteGenerationHeaders).toHaveBeenCalledWith({ traceparent });
    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://api.promptfoo.test/task',
      expect.objectContaining({
        headers: { authorization: 'Bearer test', traceparent },
      }),
      1234,
    );
  });

  it('redacts inline image data from remote grading debug logs', async () => {
    vi.mocked(getUserEmail).mockReturnValue('user@example.com');
    vi.mocked(getRemoteGenerationUrl).mockReturnValue('https://api.promptfoo.test/task');
    vi.mocked(getRemoteGenerationHeaders).mockReturnValue({ authorization: 'Bearer test' });
    vi.mocked(getRequestTimeoutMs).mockReturnValue(1234);
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        result: {
          pass: true,
          score: 1,
          reason: 'ok',
        },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    await doRemoteGrading({
      task: 'llm-rubric',
      rubric: 'Only pass if the response is correct.',
      output: 'Example output',
      vars: {},
      images: [{ data: 'data:image/png;base64,abc123', mimeType: 'image/png' }],
    });

    expect(mockLoggerDebug).toHaveBeenCalledWith('Performing remote grading', {
      body: expect.objectContaining({
        images: [{ data: '[REDACTED_IMAGE_DATA]', mimeType: 'image/png' }],
      }),
    });
    const firstDebugPayload = mockLoggerDebug.mock.calls[0][1] as {
      body: { images: Array<{ data: string; mimeType: string }> };
    };
    expect(firstDebugPayload.body.images[0].data).toBe('[REDACTED_IMAGE_DATA]');
    expect(containsString(mockLoggerDebug.mock.calls, 'abc123')).toBe(false);
    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://api.promptfoo.test/task',
      expect.objectContaining({
        body: expect.stringContaining('abc123'),
      }),
      1234,
    );
  });
});
