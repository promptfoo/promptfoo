import { afterEach, expect, it, vi } from 'vitest';
import { runAssertion } from '../src/assertions/index';
import { fetchWithCache } from '../src/cache';
import { doRemoteScoringWithPi } from '../src/remoteScoring';
import { createMockFetchResponse } from './providers/mockProviderResponses';

vi.mock('../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

afterEach(() => vi.unstubAllEnvs());

it.each([
  { score: 0.5, threshold: undefined, pass: true },
  { score: 0.8, threshold: 0.8, pass: true },
  { score: 0.79, threshold: 0.8, pass: false },
  { score: 0.81, threshold: 0.8, pass: true },
  { score: 0, threshold: 0, pass: true },
])('grades Pi score $score against threshold $threshold', async ({ score, threshold, pass }) => {
  vi.stubEnv('WITHPI_API_KEY', 'test-key');
  vi.mocked(fetchWithCache).mockResolvedValue(
    createMockFetchResponse({ total_score: score, question_scores: { correct: score } }),
  );
  const result = await doRemoteScoringWithPi(
    { llm_input: 'Hello?', llm_output: 'Hello!', scoring_spec: [{ question: 'correct' }] },
    threshold,
  );
  expect(result).toMatchObject({ pass, score, namedScores: { correct: score } });
});

it('honors the exact boundary for negated Pi assertions', async () => {
  vi.stubEnv('WITHPI_API_KEY', 'test-key');
  vi.mocked(fetchWithCache).mockResolvedValue(
    createMockFetchResponse({ total_score: 0.8, question_scores: { correct: 0.8 } }),
  );

  const grading = await runAssertion({
    assertion: { type: 'not-pi', threshold: 0.8, value: 'correct' },
    prompt: 'Hello?',
    providerResponse: { output: 'Hello!' },
    test: {},
  });

  expect(grading.pass).toBe(false);
  expect(grading.score).toBeCloseTo(0.2);
  expect(grading.namedScores).toEqual({ correct: 0.8 });
});

it('rejects an unauthorized response even when its body contains a score', async () => {
  vi.stubEnv('WITHPI_API_KEY', 'test-key');
  vi.mocked(fetchWithCache).mockResolvedValue({
    ...createMockFetchResponse({ total_score: 0.1, question_scores: {} }),
    status: 401,
    statusText: 'Unauthorized',
  });

  await expect(
    runAssertion({
      assertion: { type: 'not-pi', value: 'correct' },
      prompt: 'Hello?',
      providerResponse: { output: 'Hello!' },
      test: {},
    }),
  ).rejects.toThrow('Pi scoring failed with status 401');
});
