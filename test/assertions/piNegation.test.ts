import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../src/assertions/index';
import { fetchWithCache } from '../../src/cache';
import { createMockFetchResponse } from '../providers/mockProviderResponses';

import type { Assertion } from '../../src/types/index';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

function grade(type: Assertion['type'], threshold?: number) {
  return runAssertion({
    assertion: { type, value: 'Is the reply polite?', threshold },
    prompt: 'Say hello',
    providerResponse: { output: 'Hello there' },
    test: {},
  });
}

beforeEach(() => vi.stubEnv('WITHPI_API_KEY', 'test-key'));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe('pi negation through assertion dispatch', () => {
  it.each([
    { totalScore: 0.8, threshold: undefined, pass: true },
    { totalScore: 0.2, threshold: undefined, pass: false },
    { totalScore: 0.8, threshold: 0.9, pass: false },
    { totalScore: 0.8, threshold: 0.8, pass: true },
  ])('inverts the verdict and score (%j)', async ({ totalScore, threshold, pass }) => {
    vi.mocked(fetchWithCache).mockResolvedValue(
      createMockFetchResponse({
        total_score: totalScore,
        question_scores: { politeness: totalScore },
      }),
    );
    const positive = await grade('pi', threshold);
    const inverse = await grade('not-pi', threshold);

    expect(positive).toMatchObject({ pass, score: totalScore });
    expect(inverse).toEqual({
      ...positive,
      assertion: { type: 'not-pi', value: 'Is the reply polite?', threshold },
      pass: !pass,
      score: 1 - totalScore,
    });
  });

  it.each([
    { status: 401, score: 0.8, error: 'status 401' },
    { status: 200, score: null, error: 'numeric total_score' },
    { status: 200, score: '0.8', error: 'numeric total_score' },
  ])('rejects HTTP $status with score $score', async ({ status, score, error }) => {
    vi.mocked(fetchWithCache).mockResolvedValue(
      createMockFetchResponse({ total_score: score }, { status }),
    );
    await expect(grade('not-pi')).rejects.toThrow(error);
  });

  it('preserves transport errors under negation', async () => {
    vi.mocked(fetchWithCache).mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(grade('not-pi')).rejects.toThrow('ECONNREFUSED');
  });
});
