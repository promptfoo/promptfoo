import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../src/cache';
import { getEnvString } from '../src/envars';
import logger from '../src/logger';
import { getRequestTimeoutMs } from '../src/providers/shared';
import { doRemoteScoringWithPi } from '../src/remoteScoring';
import { HttpRateLimitError } from '../src/util/fetch/errors';

vi.mock('../src/cache', () => ({
  fetchWithCache: vi.fn(),
}));

vi.mock('../src/envars', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/envars')>()),
  getEnvString: vi.fn(),
}));

vi.mock('../src/providers/shared', () => ({
  getRequestTimeoutMs: vi.fn(),
}));

vi.mock('../src/logger', () => ({
  default: {
    debug: vi.fn(),
  },
}));

const payload = {
  llm_input: 'SECRET_PI_INPUT',
  llm_output: 'SECRET_PI_OUTPUT',
  scoring_spec: [{ question: 'SECRET_PI_QUESTION' }],
};

function mockResponse(data: string, status = 200, statusText = 'OK') {
  vi.mocked(fetchWithCache).mockResolvedValue({
    data,
    status,
    statusText,
    cached: false,
  });
}

describe('doRemoteScoringWithPi', () => {
  beforeEach(() => {
    vi.mocked(getEnvString).mockImplementation((name) =>
      name === 'WITHPI_API_KEY' ? 'SECRET_PI_API_KEY' : '',
    );
    vi.mocked(getRequestTimeoutMs).mockReturnValue(1234);
    mockResponse(
      JSON.stringify({
        question_scores: { criterion: 0.9 },
        total_score: 0.9,
      }),
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('logs only question count while preserving the request and result', async () => {
    const result = await doRemoteScoringWithPi(payload, 0.5);

    expect(result).toMatchObject({
      pass: true,
      score: 0.9,
      namedScores: { criterion: 0.9 },
      reason: 'Pi Scorer',
    });
    expect(logger.debug).toHaveBeenCalledWith('Performing remote scoring with Pi', {
      questionCount: 1,
    });
    const logs = JSON.stringify(vi.mocked(logger.debug).mock.calls);
    expect(logs).not.toContain('SECRET_PI_INPUT');
    expect(logs).not.toContain('SECRET_PI_OUTPUT');
    expect(logs).not.toContain('SECRET_PI_QUESTION');
    expect(logs).not.toContain('SECRET_PI_API_KEY');
    expect(fetchWithCache).toHaveBeenCalledWith(
      'https://api.withpi.ai/v1/scoring_system/score',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'SECRET_PI_API_KEY',
          'x-promptfoo-silent': 'true',
        },
        body: expect.stringContaining('SECRET_PI_OUTPUT'),
      }),
      1234,
      'text',
    );
  });

  it('returns a status-only error for rejected requests', async () => {
    mockResponse('SECRET_PI_REJECTION_BODY', 403, 'SECRET_PI_REJECTION_STATUS');

    await expect(doRemoteScoringWithPi(payload)).rejects.toThrow(
      'Could not perform remote grading: Remote Pi scoring failed with status 403',
    );

    const logs = JSON.stringify(vi.mocked(logger.debug).mock.calls);
    expect(logs).not.toContain('SECRET_PI_REJECTION_BODY');
    expect(logs).not.toContain('SECRET_PI_REJECTION_STATUS');
  });

  it.each([
    {
      data: 'SECRET_PI_MALFORMED_JSON',
      expected: 'Remote Pi scoring response was not valid JSON',
    },
    {
      data: JSON.stringify({
        question_scores: { criterion: 'SECRET_PI_BAD_SCORE' },
        total_score: 0.9,
      }),
      expected: 'Remote Pi scoring response data is invalid',
    },
  ])('safely rejects malformed responses', async ({ data, expected }) => {
    mockResponse(data);

    await expect(doRemoteScoringWithPi(payload)).rejects.toThrow(
      `Could not perform remote grading: ${expected}`,
    );

    expect(JSON.stringify(vi.mocked(logger.debug).mock.calls)).not.toContain('SECRET_PI_BAD_SCORE');
  });

  it('safely rejects unserializable payloads before fetching', async () => {
    const circular: Record<string, unknown> = { marker: 'SECRET_PI_CIRCULAR' };
    circular.self = circular;

    await expect(
      doRemoteScoringWithPi({
        ...payload,
        scoring_spec: circular as unknown as Array<{ question: string }>,
      }),
    ).rejects.toThrow(
      'Could not perform remote grading: Remote Pi scoring payload is not serializable',
    );

    expect(fetchWithCache).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(logger.debug).mock.calls)).not.toContain('SECRET_PI_CIRCULAR');
  });

  it.each([
    {
      error: new HttpRateLimitError({
        status: 429,
        statusText: 'SECRET_PI_RATE_STATUS',
        body: 'SECRET_PI_RATE_BODY',
      }),
      expected: 'Remote Pi scoring rate limited (HTTP 429)',
    },
    {
      error: new Error('Request failed after 4 retries: Error: Request timed out after 1234 ms'),
      expected: 'Remote Pi scoring request timed out',
    },
  ])('preserves the safe $expected failure category', async ({ error, expected }) => {
    vi.mocked(fetchWithCache).mockRejectedValue(error);

    await expect(doRemoteScoringWithPi(payload)).rejects.toThrow(
      `Could not perform remote grading: ${expected}`,
    );
  });

  it('does not expose transport errors or causes', async () => {
    vi.mocked(fetchWithCache).mockRejectedValue(
      new Error('Bearer SECRET_PI_TRANSPORT', {
        cause: new Error('Basic SECRET_PI_CAUSE'),
      }),
    );

    await expect(doRemoteScoringWithPi(payload)).rejects.toThrow(
      'Could not perform remote grading: Remote Pi scoring request failed',
    );
  });

  it('keeps the missing API key diagnostic actionable', async () => {
    vi.mocked(getEnvString).mockReturnValue('');

    await expect(doRemoteScoringWithPi(payload)).rejects.toThrow(
      'Could not perform remote grading: Env var WITHPI_API_KEY must be set.',
    );
    expect(fetchWithCache).not.toHaveBeenCalled();
  });
});
