import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../src/cache';
import { getUserEmail } from '../src/globalConfig/accounts';
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
});
