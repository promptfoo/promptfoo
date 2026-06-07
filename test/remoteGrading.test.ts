import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../src/cache';
import { getUserEmail } from '../src/globalConfig/accounts';
import { getRequestTimeoutMs } from '../src/providers/shared';
import {
  getRemoteGenerationHeaders,
  getRemoteGenerationUrl,
} from '../src/redteam/remoteGeneration';
import { doRemoteGrading } from '../src/remoteGrading';

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
