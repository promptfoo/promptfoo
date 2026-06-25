import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../src/cache';
import { getUserEmail } from '../src/globalConfig/accounts';
import logger from '../src/logger';
import { getRequestTimeoutMs } from '../src/providers/shared';
import {
  getRemoteGenerationHeaders,
  getRemoteGenerationUrl,
} from '../src/redteam/remoteGeneration';
import { doRemoteGrading } from '../src/remoteGrading';

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
    debug: vi.fn(),
  },
}));

describe('doRemoteGrading', () => {
  beforeEach(() => {
    vi.mocked(getUserEmail).mockReturnValue('sensitive-user@example.com');
    vi.mocked(getRemoteGenerationUrl).mockReturnValue('https://remote-grading.example.com');
    vi.mocked(getRemoteGenerationHeaders).mockImplementation((headers = {}) => ({
      authorization: 'Bearer test',
      ...headers,
    }));
    vi.mocked(getRequestTimeoutMs).mockReturnValue(1234);
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        result: {
          pass: true,
          score: 1,
          reason: 'SECRET_RESPONSE_REASON',
        },
      },
      status: 200,
      statusText: 'OK',
      cached: false,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('does not log sensitive grading payload or response content', async () => {
    await doRemoteGrading({
      task: 'llm-rubric',
      prompt: 'SECRET_PROMPT_TEXT',
      vars: { input: 'SECRET_INPUT_TEXT' },
      images: [{ data: 'data:image/png;base64,SECRET_IMAGE_DATA', mimeType: 'image/png' }],
      targetId: 'SECRET_TARGET_ID',
    });

    const serializedDebugLogs = JSON.stringify(vi.mocked(logger.debug).mock.calls);

    expect(serializedDebugLogs).toContain('"task":"llm-rubric"');
    expect(serializedDebugLogs).toContain('"hasResult":true');
    expect(serializedDebugLogs).not.toContain('SECRET_PROMPT_TEXT');
    expect(serializedDebugLogs).not.toContain('SECRET_INPUT_TEXT');
    expect(serializedDebugLogs).not.toContain('sensitive-user@example.com');
    expect(serializedDebugLogs).not.toContain('SECRET_IMAGE_DATA');
    expect(serializedDebugLogs).not.toContain('SECRET_TARGET_ID');
    expect(serializedDebugLogs).not.toContain('SECRET_RESPONSE_REASON');
    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://remote-grading.example.com',
      expect.objectContaining({
        headers: {
          authorization: 'Bearer test',
          'x-promptfoo-silent': 'true',
        },
        body: expect.stringContaining('SECRET_IMAGE_DATA'),
      }),
      1234,
      'json',
      true,
    );
    expect(logger.debug).toHaveBeenCalledWith('Performing remote grading', {
      task: 'llm-rubric',
    });
  });

  it('preserves grader error metadata from remote grading results', async () => {
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
    });

    const result = await doRemoteGrading({ task: 'llm-rubric' });

    expect(result).toMatchObject({
      pass: false,
      score: 0,
      reason: 'API error: 429 Too Many Requests',
      metadata: { graderError: true },
    });
  });

  it('does not add grader error metadata when remote grading succeeds without metadata', async () => {
    const result = await doRemoteGrading({ task: 'llm-rubric' });

    expect(result).toMatchObject({
      pass: true,
      score: 1,
      reason: 'SECRET_RESPONSE_REASON',
    });
    expect(result.metadata?.graderError).toBeUndefined();
  });

  it('does not expose response content in non-200 errors or logs', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        error: 'SECRET_REMOTE_ERROR',
      },
      status: 500,
      statusText: 'SECRET_STATUS_TEXT',
      cached: false,
    });

    await expect(
      doRemoteGrading({
        task: 'llm-rubric',
        prompt: 'SECRET_PROMPT_TEXT',
      }),
    ).rejects.toThrow('Remote grading failed with status 500');

    const allOutput = JSON.stringify(vi.mocked(logger.debug).mock.calls);
    expect(allOutput).not.toContain('SECRET_REMOTE_ERROR');
    expect(allOutput).not.toContain('SECRET_STATUS_TEXT');
  });

  it('does not expose invalid response data in thrown errors', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        result: {
          reason: 'SECRET_INVALID_RESPONSE_REASON',
        },
      },
      status: 200,
      statusText: 'OK',
      cached: false,
    });

    await expect(doRemoteGrading({ task: 'llm-rubric' })).rejects.toThrow(
      'Remote grading failed. Response data is invalid',
    );

    const allOutput = JSON.stringify(vi.mocked(logger.debug).mock.calls);
    expect(allOutput).not.toContain('SECRET_INVALID_RESPONSE_REASON');
  });

  it.each([
    'true',
    1,
    null,
  ])('rejects invalid pass values without exposing response data (%s)', async (pass) => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        result: {
          pass,
          reason: 'SECRET_NON_BOOLEAN_PASS_REASON',
        },
      },
      status: 200,
      statusText: 'OK',
      cached: false,
    });

    await expect(doRemoteGrading({ task: 'llm-rubric' })).rejects.toThrow(
      'Remote grading failed. Response data is invalid',
    );

    const allOutput = JSON.stringify(vi.mocked(logger.debug).mock.calls);
    expect(allOutput).not.toContain('SECRET_NON_BOOLEAN_PASS_REASON');
  });

  it.each([
    null,
    'SECRET_STRING_RESPONSE',
    ['SECRET_ARRAY_RESPONSE'],
  ])('returns the safe invalid response error for non-object JSON payloads', async (data) => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data,
      status: 200,
      statusText: 'OK',
      cached: false,
    });

    await expect(doRemoteGrading({ task: 'llm-rubric' })).rejects.toThrow(
      'Remote grading failed. Response data is invalid',
    );

    const allOutput = JSON.stringify(vi.mocked(logger.debug).mock.calls);
    expect(allOutput).not.toContain('SECRET_STRING_RESPONSE');
    expect(allOutput).not.toContain('SECRET_ARRAY_RESPONSE');
  });

  it('does not expose transport error messages in thrown errors', async () => {
    vi.mocked(fetchWithCache).mockRejectedValue(new Error('SECRET_TRANSPORT_ERROR'));

    await expect(doRemoteGrading({ task: 'llm-rubric' })).rejects.toThrow(
      'Remote grading request failed',
    );
  });

  it('does not trust prefixed transport error messages as safe status errors', async () => {
    vi.mocked(fetchWithCache).mockRejectedValue(
      new Error('Remote grading failed with status 500 SECRET_STATUS_SUFFIX'),
    );

    await expect(doRemoteGrading({ task: 'llm-rubric' })).rejects.toThrow(
      'Remote grading request failed',
    );
  });
});
