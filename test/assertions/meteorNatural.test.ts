import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleMeteorAssertion } from '../../src/assertions/meteor';

import type { AssertionParams } from '../../src/types/index';

// Match Node's default-only CommonJS namespace while using the real NLP implementations.
vi.mock('natural', async (importOriginal) => {
  const natural = await importOriginal<typeof import('natural')>();
  return { default: 'default' in natural ? natural.default : natural };
});

afterEach(() => {
  vi.resetAllMocks();
});

describe('METEOR with the Natural CommonJS default export', () => {
  it.each([
    {
      description: 'matches real Porter stems',
      candidate: 'cats running',
      reference: 'cat run',
      threshold: 0.9,
      score: 15 / 16,
      pass: true,
    },
    {
      description: 'matches real WordNet synonyms',
      candidate: 'car',
      reference: 'auto',
      threshold: 0.5,
      score: 0.5,
      pass: true,
    },
    {
      description: 'looks up the original candidate when its stem is absent from WordNet',
      candidate: 'automobile',
      reference: 'car',
      threshold: 0.5,
      score: 0.5,
      pass: true,
    },
    {
      description: 'compares WordNet synonyms against the original reference',
      candidate: 'car',
      reference: 'automobile',
      threshold: 0.5,
      score: 0.5,
      pass: true,
    },
    {
      description: 'rejects unrelated words',
      candidate: 'qzxw',
      reference: 'jvkp',
      threshold: 0.5,
      score: 0,
      pass: false,
    },
  ])('$description', async ({ candidate, reference, threshold, score, pass }) => {
    const result = await handleMeteorAssertion({
      assertion: { type: 'meteor', value: reference, threshold },
      renderedValue: reference,
      outputString: candidate,
      inverse: false,
    } as AssertionParams);

    expect(result.pass).toBe(pass);
    expect(result.score).toBeCloseTo(score, 12);
  });
});
