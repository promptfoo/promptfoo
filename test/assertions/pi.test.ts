import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlePiScorer } from '../../src/assertions/pi';
import { matchesPiScore } from '../../src/matchers/llmGrading';

import type { AssertionParams } from '../../src/types/index';

vi.mock('../../src/matchers/llmGrading');

const params: AssertionParams = {
  assertion: { type: 'pi', value: 'test question' },
  baseType: 'pi',
  assertionValueContext: {
    prompt: 'test prompt',
    vars: {},
    test: { vars: {} },
    logProbs: undefined,
    provider: undefined,
    providerResponse: undefined,
  },
  inverse: false,
  output: 'test output',
  outputString: 'test output',
  prompt: 'test prompt',
  providerResponse: {},
  renderedValue: 'test question',
  test: { vars: {} },
};

describe('handlePiScorer', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requires a string value', async () => {
    await expect(handlePiScorer({ ...params, renderedValue: {} })).rejects.toThrow(
      '"pi" assertion type must have a string value',
    );
  });

  it('requires a prompt', async () => {
    await expect(handlePiScorer({ ...params, prompt: undefined })).rejects.toThrow(
      '"pi" assertion must have a prompt that is a string',
    );
  });

  it.each([false, true])(
    'preserves scorer details and inverts only verdicts (inverse=%s)',
    async (inverse) => {
      for (const pass of [false, true]) {
        const result = {
          pass,
          score: pass ? 0.8 : 0.2,
          reason: 'Pi Scorer',
          namedScores: { quality: 0.8 },
        };
        vi.mocked(matchesPiScore).mockResolvedValue(result);
        const actual = await handlePiScorer({ ...params, inverse });
        expect(matchesPiScore).toHaveBeenCalledWith(
          'test question',
          'test prompt',
          'test output',
          params.assertion,
        );
        expect(actual).toMatchObject({
          reason: result.reason,
          namedScores: result.namedScores,
          pass: inverse ? !pass : pass,
        });
        expect(actual.score).toBeCloseTo(inverse ? 1 - result.score : result.score);
      }
    },
  );

  it.each([false, true])(
    'does not turn a scorer error into a verdict (inverse=%s)',
    async (inverse) => {
      const failure = new Error('Fixture scorer unavailable');
      vi.mocked(matchesPiScore).mockRejectedValue(failure);
      await expect(handlePiScorer({ ...params, inverse })).rejects.toBe(failure);
    },
  );

  it.each([false, true])('rejects a missing or invalid score (inverse=%s)', async (inverse) => {
    for (const score of [undefined, Number.NaN, Infinity]) {
      vi.mocked(matchesPiScore).mockResolvedValue({
        pass: false,
        score,
        reason: 'Pi Scorer',
      } as Awaited<ReturnType<typeof matchesPiScore>>);
      expect(await handlePiScorer({ ...params, inverse })).toMatchObject({
        pass: false,
        score: 0,
        metadata: { graderError: true },
      });
    }
  });
});
