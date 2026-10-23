import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../src/assertions/index';
import { fetchWithCache } from '../../src/cache';
import { createMockFetchResponse } from '../providers/mockProviderResponses';
import { mockProcessEnv } from '../util/utils';

import type { Assertion } from '../../src/types/index';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

function mockPiScore(totalScore: number) {
  vi.mocked(fetchWithCache).mockResolvedValue(
    createMockFetchResponse({
      total_score: totalScore,
      question_scores: { 'Is the reply polite?': totalScore },
    }),
  );
}

async function grade(type: Assertion['type'], threshold?: number) {
  return runAssertion({
    assertion: { type, value: 'Is the reply polite?', threshold },
    prompt: 'Say hello',
    providerResponse: { output: 'Hello there' },
    test: {},
  });
}

let restoreEnv: () => void;

beforeEach(() => {
  restoreEnv = mockProcessEnv({ WITHPI_API_KEY: 'test-key' });
});

afterEach(() => {
  restoreEnv();
  vi.resetAllMocks();
});

describe('pi negation through assertion dispatch', () => {
  it.each([
    { totalScore: 0.8, threshold: undefined, pass: true },
    { totalScore: 0.2, threshold: undefined, pass: false },
    { totalScore: 0.8, threshold: 0.9, pass: false },
  ])('inverts the verdict and score (%j)', async ({ totalScore, threshold, pass }) => {
    mockPiScore(totalScore);
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
    {
      name: 'a network failure',
      mock: () => vi.mocked(fetchWithCache).mockRejectedValue(new Error('connect ECONNREFUSED')),
    },
    {
      name: 'an HTTP error response',
      mock: () =>
        vi
          .mocked(fetchWithCache)
          .mockResolvedValue(
            createMockFetchResponse(
              { detail: 'Invalid API key' },
              { status: 401, statusText: 'Unauthorized' },
            ),
          ),
    },
    {
      name: 'a response without a numeric score',
      mock: () =>
        vi.mocked(fetchWithCache).mockResolvedValue(createMockFetchResponse({ total_score: null })),
    },
  ])('does not turn $name into a pass', async ({ mock }) => {
    mock();

    for (const type of ['pi', 'not-pi'] as const) {
      await expect(grade(type)).rejects.toThrow('Could not perform remote grading');
    }
  });
});
