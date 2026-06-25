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
import { HttpRateLimitError } from '../src/util/fetch/errors';

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

const validResult = {
  pass: true,
  score: 1,
  reason: 'SECRET_RESPONSE_REASON',
};

function responseText(result: unknown = validResult): string {
  return JSON.stringify({ result });
}

function mockResponse(data: string, status = 200, statusText = 'OK') {
  vi.mocked(fetchWithCache).mockResolvedValue({
    data,
    status,
    statusText,
    cached: false,
  });
}

describe('doRemoteGrading', () => {
  beforeEach(() => {
    vi.mocked(getUserEmail).mockReturnValue('sensitive-user@example.com');
    vi.mocked(getRemoteGenerationUrl).mockReturnValue('https://remote-grading.example.com');
    vi.mocked(getRemoteGenerationHeaders).mockImplementation((headers = {}) => ({
      authorization: 'Bearer test',
      ...headers,
    }));
    vi.mocked(getRequestTimeoutMs).mockReturnValue(1234);
    mockResponse(responseText());
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('logs only bounded metadata while preserving the wire payload and cache behavior', async () => {
    const result = await doRemoteGrading({
      task: 'llm-rubric',
      prompt: 'SECRET_PROMPT_TEXT',
      vars: {
        input: 'SECRET_INPUT_TEXT',
        nested: [{ authorization: 'Bearer SECRET_NESTED_TOKEN' }],
      },
      images: [{ data: 'data:image/png;base64,SECRET_IMAGE_DATA', mimeType: 'image/png' }],
      targetId: 'SECRET_TARGET_ID',
    });

    const serializedDebugLogs = JSON.stringify(vi.mocked(logger.debug).mock.calls);

    expect(result).toEqual(validResult);
    expect(serializedDebugLogs).toContain('"task":"llm-rubric"');
    expect(serializedDebugLogs).toContain('"status":200');
    expect(serializedDebugLogs).toContain('"hasResult":true');
    expect(serializedDebugLogs).toContain('"resultType":"object"');
    for (const secret of [
      'SECRET_PROMPT_TEXT',
      'SECRET_INPUT_TEXT',
      'SECRET_NESTED_TOKEN',
      'sensitive-user@example.com',
      'SECRET_IMAGE_DATA',
      'SECRET_TARGET_ID',
      'SECRET_RESPONSE_REASON',
    ]) {
      expect(serializedDebugLogs).not.toContain(secret);
    }
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
      'text',
    );
    expect(logger.debug).toHaveBeenCalledWith('Performing remote grading', {
      task: 'llm-rubric',
    });
  });

  it('preserves grader error metadata from remote grading results', async () => {
    mockResponse(
      responseText({
        pass: false,
        score: 0,
        reason: 'API error: 429 Too Many Requests',
        metadata: { graderError: true },
      }),
    );

    const result = await doRemoteGrading({ task: 'llm-rubric' });

    expect(result).toMatchObject({
      pass: false,
      score: 0,
      reason: 'API error: 429 Too Many Requests',
      metadata: { graderError: true },
    });
  });

  it('does not inspect or expose a non-200 response body', async () => {
    mockResponse('BODY_SECRET_REJECT_8652', 503, 'STATUS_SECRET_REJECT_8652');

    await expect(doRemoteGrading({ task: 'llm-rubric' })).rejects.toThrow(
      'Remote grading failed with status 503',
    );

    const allOutput = JSON.stringify(vi.mocked(logger.debug).mock.calls);
    expect(allOutput).not.toContain('BODY_SECRET_REJECT_8652');
    expect(allOutput).not.toContain('STATUS_SECRET_REJECT_8652');
    expect(allOutput).toContain('"resultType":"not-inspected"');
  });

  it('classifies malformed JSON without exposing the response text', async () => {
    mockResponse('{"result":{"reason":"BODY_SECRET_MALFORMED_8652"');

    await expect(doRemoteGrading({ task: 'llm-rubric' })).rejects.toThrow(
      'Remote grading failed. Response was not valid JSON',
    );

    const allOutput = JSON.stringify(vi.mocked(logger.debug).mock.calls);
    expect(allOutput).not.toContain('BODY_SECRET_MALFORMED_8652');
    expect(allOutput).toContain('"resultType":"invalid-json"');
  });

  it.each([
    null,
    'SECRET_STRING_RESPONSE',
    ['SECRET_ARRAY_RESPONSE'],
  ])('rejects invalid response envelopes without exposing content', async (data) => {
    mockResponse(JSON.stringify(data));

    await expect(doRemoteGrading({ task: 'llm-rubric' })).rejects.toThrow(
      'Remote grading failed. Response data is invalid',
    );

    const allOutput = JSON.stringify(vi.mocked(logger.debug).mock.calls);
    expect(allOutput).not.toContain('SECRET_STRING_RESPONSE');
    expect(allOutput).not.toContain('SECRET_ARRAY_RESPONSE');
  });

  it.each([
    { pass: 'true', score: 1, reason: 'SECRET_BAD_PASS' },
    { pass: true, score: '1', reason: 'SECRET_BAD_SCORE' },
    { pass: true, score: 1, reason: { text: 'SECRET_BAD_REASON' } },
    { pass: true, score: 1 },
  ])('uses the canonical grading-result contract for malformed results', async (result) => {
    mockResponse(responseText(result));

    await expect(doRemoteGrading({ task: 'llm-rubric' })).rejects.toThrow(
      'Remote grading failed. Response data is invalid',
    );

    const allOutput = JSON.stringify(vi.mocked(logger.debug).mock.calls);
    expect(allOutput).not.toContain('SECRET_BAD_PASS');
    expect(allOutput).not.toContain('SECRET_BAD_SCORE');
    expect(allOutput).not.toContain('SECRET_BAD_REASON');
  });

  it.each([
    {
      name: 'circular reference',
      makePayload: () => {
        const circular: Record<string, unknown> = { marker: 'SECRET_CIRCULAR' };
        circular.self = circular;
        return { task: 'llm-rubric', circular };
      },
    },
    {
      name: 'bigint',
      makePayload: () => ({ task: 'llm-rubric', value: 1n }),
    },
    {
      name: 'throwing toJSON',
      makePayload: () => ({
        task: 'llm-rubric',
        value: {
          toJSON() {
            throw new Error('SECRET_TO_JSON_ERROR');
          },
        },
      }),
    },
    {
      name: 'throwing getter',
      makePayload: () => {
        const value = {};
        Object.defineProperty(value, 'secret', {
          enumerable: true,
          get() {
            throw new Error('SECRET_GETTER_ERROR');
          },
        });
        return { task: 'llm-rubric', value };
      },
    },
  ])('safely classifies an unserializable payload: $name', async ({ makePayload }) => {
    await expect(doRemoteGrading(makePayload())).rejects.toThrow(
      'Remote grading request payload is not serializable',
    );

    expect(fetchWithCache).not.toHaveBeenCalled();
    const allOutput = JSON.stringify(vi.mocked(logger.debug).mock.calls);
    expect(allOutput).not.toContain('SECRET_');
  });

  it('does not re-read an adversarial task getter for logging', async () => {
    let reads = 0;
    const payload = { vars: {} } as { task: string; vars: Record<string, unknown> };
    Object.defineProperty(payload, 'task', {
      enumerable: true,
      get() {
        reads += 1;
        return reads === 1 ? 'llm-rubric' : 'SECRET_STATEFUL_TASK';
      },
    });

    await doRemoteGrading(payload);

    const allOutput = JSON.stringify(vi.mocked(logger.debug).mock.calls);
    expect(allOutput).toContain('"task":"llm-rubric"');
    expect(allOutput).not.toContain('SECRET_STATEFUL_TASK');
  });

  it.each([
    {
      error: new HttpRateLimitError({
        status: 429,
        statusText: 'SECRET_RATE_STATUS',
        body: { error: 'SECRET_RATE_BODY' },
      }),
      expected: 'Remote grading rate limited (HTTP 429)',
    },
    {
      error: new HttpRateLimitError({
        status: 429,
        statusText: 'SECRET_QUOTA_STATUS',
        code: 'insufficient_quota',
        body: { error: 'SECRET_QUOTA_BODY' },
      }),
      expected: 'Remote grading quota exceeded (HTTP 429)',
    },
    {
      error: new Error('Request failed after 4 retries: Error: Request timed out after 1234 ms'),
      expected: 'Remote grading request timed out',
    },
  ])('preserves the safe $expected failure category', async ({ error, expected }) => {
    vi.mocked(fetchWithCache).mockRejectedValue(error);

    let thrown: Error | undefined;
    try {
      await doRemoteGrading({ task: 'llm-rubric' });
    } catch (caught) {
      thrown = caught as Error;
    }

    expect(thrown?.message).toBe(expected);
    expect(thrown?.message).not.toContain('SECRET_');
  });

  it('does not expose arbitrary transport messages or causes', async () => {
    const transportError = new Error('Bearer SECRET_TRANSPORT_ERROR', {
      cause: new Error('Basic SECRET_TRANSPORT_CAUSE'),
    });
    vi.mocked(fetchWithCache).mockRejectedValue(transportError);

    await expect(doRemoteGrading({ task: 'llm-rubric' })).rejects.toThrow(
      'Remote grading request failed',
    );

    const allOutput = JSON.stringify(vi.mocked(logger.debug).mock.calls);
    expect(allOutput).not.toContain('SECRET_TRANSPORT_ERROR');
    expect(allOutput).not.toContain('SECRET_TRANSPORT_CAUSE');
  });
});
