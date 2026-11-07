import { afterEach, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../src/cache';
import { doRemoteScoringWithPi } from '../src/remoteScoring';
import { createMockFetchResponse } from './providers/mockProviderResponses';

vi.mock('../src/cache', () => ({ fetchWithCache: vi.fn() }));

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
