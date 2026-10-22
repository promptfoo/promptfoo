import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../src/cache';
import { doRemoteScoringWithPi } from '../src/remoteScoring';

vi.mock('../src/cache', () => ({
  fetchWithCache: vi.fn(),
}));

const payload = {
  llm_input: 'What is the capital of France?',
  llm_output: 'Paris',
  scoring_spec: [{ question: 'Is the answer correct?' }],
};

function mockPiScore(totalScore: number) {
  vi.mocked(fetchWithCache).mockResolvedValue({
    data: { total_score: totalScore, question_scores: { 'Is the answer correct?': totalScore } },
    cached: false,
    status: 200,
    statusText: 'OK',
  });
}

describe('doRemoteScoringWithPi', () => {
  beforeEach(() => {
    vi.stubEnv('WITHPI_API_KEY', 'test-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });

  it('passes when the score equals the threshold', async () => {
    mockPiScore(0.5);

    const result = await doRemoteScoringWithPi(payload, 0.5);

    expect(result.pass).toBe(true);
    expect(result.score).toBe(0.5);
  });

  it('fails when the score is below the threshold', async () => {
    mockPiScore(0.49);

    const result = await doRemoteScoringWithPi(payload, 0.5);

    expect(result.pass).toBe(false);
  });

  it('passes when the score is above the threshold', async () => {
    mockPiScore(0.51);

    const result = await doRemoteScoringWithPi(payload, 0.5);

    expect(result.pass).toBe(true);
  });

  it('passes a score equal to the default threshold of 0.5', async () => {
    mockPiScore(0.5);

    const result = await doRemoteScoringWithPi(payload);

    expect(result.pass).toBe(true);
  });
});
