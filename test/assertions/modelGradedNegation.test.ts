import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../src/assertions/index';
import { createMockProvider } from '../factories/provider';

import type { Assertion, ProviderResponse } from '../../src/types/index';

const tokenUsage = { total: 11, prompt: 5, completion: 6 };

async function grade(type: Assertion['type'], response: ProviderResponse) {
  return runAssertion({
    assertion: { type, value: 'The reference answer' },
    prompt: 'The question',
    providerResponse: { output: 'The submitted answer' },
    test: {
      options: {
        provider: createMockProvider({ response: { ...response, tokenUsage } }),
        factuality: { subset: 0.75 },
      },
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(['factuality', 'model-graded-factuality', 'model-graded-closedqa'] as const)(
  '%s negation through assertion dispatch',
  (type) => {
    const closedQa = type === 'model-graded-closedqa';
    const inverseType = `not-${type}` as const;

    it.each([true, false])('inverts a valid verdict (positive pass: %s)', async (pass) => {
      const response = {
        output: closedQa ? (pass ? 'Y' : 'N') : JSON.stringify({ category: pass ? 'A' : 'D' }),
      };
      const positive = await grade(type, response);
      const inverse = await grade(inverseType, response);
      const score = pass ? (closedQa ? 1 : 0.75) : 0;

      expect(positive).toMatchObject({ pass, score, tokensUsed: tokenUsage });
      expect(inverse).toEqual({
        ...positive,
        assertion: { type: inverseType, value: 'The reference answer' },
        pass: !pass,
        score: 1 - score,
      });
    });

    it.each<ProviderResponse>([
      { error: 'Grader unavailable' },
      { output: '' },
      { output: 'I cannot grade this answer.' },
    ])('keeps grader failures as failures: %j', async (response) => {
      for (const assertionType of [type, inverseType]) {
        expect(await grade(assertionType, response)).toMatchObject({
          pass: false,
          score: 0,
          metadata: { graderError: true },
          tokensUsed: tokenUsage,
        });
      }
    });
  },
);
