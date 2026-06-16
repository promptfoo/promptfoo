import { describe, expect, it } from 'vitest';
import { handleMeteorAssertion } from '../../src/assertions/meteor';

import type { AssertionParams } from '../../src/types/index';

// Calls the REAL handleMeteorAssertion (meteor.test.ts mocks it, so the actual
// tokenization is not covered there).
const meteor = async (outputString: string, renderedValue: string): Promise<number> =>
  (
    await handleMeteorAssertion({
      assertion: { type: 'meteor' },
      renderedValue,
      outputString,
      inverse: false,
    } as AssertionParams)
  ).score;

describe('handleMeteorAssertion tokenization (real implementation)', () => {
  it('is unaffected by leading/trailing/duplicate whitespace', async () => {
    const clean = await meteor('the cat sat on the mat', 'the cat sat on the mat');
    expect(clean).toBeGreaterThan(0.9);

    // Before the fix, a single trailing space on the reference split into a
    // phantom empty token and dropped the score to ~0.8675.
    expect(await meteor('the cat sat on the mat', 'the cat sat on the mat ')).toBeCloseTo(
      clean,
      10,
    );
    expect(await meteor(' the cat sat on the mat', 'the cat sat on the mat')).toBeCloseTo(
      clean,
      10,
    );
    expect(await meteor('the  cat   sat on the mat', 'the cat sat on the mat')).toBeCloseTo(
      clean,
      10,
    );
  });
});
