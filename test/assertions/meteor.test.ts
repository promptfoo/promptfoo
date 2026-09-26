import { describe, expect, it } from 'vitest';
import { handleMeteorAssertion } from '../../src/assertions/meteor';

import type { AssertionParams } from '../../src/types/index';

type MeteorCase = {
  name: string;
  candidate: string;
  reference: string | string[];
  score: number;
  pass: boolean;
  inverse?: boolean;
  alpha?: number;
  beta?: number;
  gamma?: number;
};

// Golden results from the existing METEOR algorithm with Natural's Porter stemmer
// and WordNet dictionary. Exercise the real handler and dependencies.
const cases: MeteorCase[] = [
  {
    name: 'exact',
    candidate: 'the cat sat on the mat',
    reference: 'the cat sat on the mat',
    score: 0.9976851851851852,
    pass: true,
  },
  {
    name: 'stem',
    candidate: 'running jumped tests',
    reference: 'runs jumping test',
    score: 0.9814814814814815,
    pass: true,
  },
  {
    name: 'synonyms',
    candidate: 'the fast car crossed the rug',
    reference: 'the quick motorcar crossed the carpet',
    score: 0.9976851851851852,
    pass: true,
  },
  {
    name: 'no match',
    candidate: 'cat dog',
    reference: 'moon star',
    score: 0,
    pass: false,
  },
  {
    name: 'reordering',
    candidate: 'mat the on sat cat the',
    reference: 'the cat sat on the mat',
    score: 0.5,
    pass: true,
  },
  {
    name: 'multiple references',
    candidate: 'the quick motorcar',
    reference: ['the fast car', 'the quick motorcar'],
    score: 0.9814814814814815,
    pass: true,
  },
  {
    name: 'punctuation and case',
    candidate: 'The CAT sat.',
    reference: 'the cat sat',
    score: 0.9814814814814815,
    pass: true,
  },
  {
    name: 'non ASCII',
    candidate: 'café naïve résumé 東京',
    reference: 'café naïve résumé 東京',
    score: 0.9921875,
    pass: true,
  },
  {
    name: 'legacy stem pair',
    candidate: 'myelitis ptyalism',
    reference: 'myelic ptyalize',
    score: 0.9375,
    pass: true,
  },
  {
    name: 'unknown words',
    candidate: 'zzzzq xyzabc',
    reference: 'zzzzq xyzabc',
    score: 0.9375,
    pass: true,
  },
  {
    name: 'inverse',
    candidate: 'the cat sat',
    reference: 'the cat sat',
    inverse: true,
    score: 0.01851851851851849,
    pass: false,
  },
  {
    name: 'custom parameters',
    candidate: 'the cat is sitting on the mat',
    reference: 'the cats are sitting on the mats',
    alpha: 0.85,
    beta: 2,
    gamma: 0.4,
    score: 0.819047619047619,
    pass: true,
  },
];

function params(overrides: Partial<AssertionParams> = {}): AssertionParams {
  return {
    assertion: { type: 'meteor', threshold: 0.5 },
    outputString: 'the cat sat',
    renderedValue: 'the cat sat',
    inverse: false,
    ...overrides,
  } as AssertionParams;
}

describe('METEOR score calculation', () => {
  it.each(cases)(
    '$name',
    async ({ candidate, reference, score, pass, inverse, alpha, beta, gamma }) => {
      const assertion = { type: 'meteor' as const, threshold: 0.5, alpha, beta, gamma };
      const input = params({
        assertion,
        outputString: candidate,
        renderedValue: reference,
        inverse: inverse ?? false,
      });
      const result = await handleMeteorAssertion(input);
      expect(result.score).toBe(score);
      expect(result.pass).toBe(pass);
      expect(result.assertion).toBe(input.assertion);
      expect(result.reason).toEqual(
        pass ? 'METEOR assertion passed' : expect.stringContaining('did not meet threshold'),
      );
    },
  );

  it('uses the configured threshold', async () => {
    const input = params({ assertion: { type: 'meteor', threshold: 0.99 } });
    await expect(handleMeteorAssertion(input)).resolves.toMatchObject({
      pass: false,
      score: 0.9814814814814815,
      reason: 'METEOR score 0.9815 did not meet threshold 0.99',
    });
  });

  it('passes inverse assertions for dissimilar outputs', async () => {
    await expect(
      handleMeteorAssertion(
        params({
          inverse: true,
          outputString: 'cat dog',
          renderedValue: 'moon star',
        }),
      ),
    ).resolves.toMatchObject({ pass: true, score: 1 });
  });

  it.each([{ outputString: '' }, { renderedValue: [] }])(
    'rejects empty inputs: %j',
    async (overrides) => {
      await expect(handleMeteorAssertion(params(overrides))).rejects.toThrow('Invalid inputs');
    },
  );

  it.each([undefined, 123, ['cat', 123]])('rejects invalid reference %j', async (renderedValue) => {
    await expect(handleMeteorAssertion(params({ renderedValue }))).rejects.toThrow(
      '"meteor" assertion must have a string or array of strings value',
    );
  });
});
