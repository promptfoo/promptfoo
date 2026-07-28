import { describe, expect, it } from 'vitest';
import { calculateMeteorScore } from '../../src/assertions/meteor';

// These exercise the real METEOR implementation (which needs the optional `natural`
// package). All inputs match word-for-word, so alignment resolves entirely in the
// exact-match stage and no WordNet synonym lookups are performed.
describe('METEOR tokenization', () => {
  it('ignores surrounding whitespace like BLEU/GLEU do', async () => {
    const reference = 'the cat sat on the mat';

    const clean = await calculateMeteorScore(reference, [reference]);
    const padded = await calculateMeteorScore(`  ${reference}\n`, [reference]);

    // Leading/trailing whitespace previously injected empty tokens that inflated the
    // candidate length and dropped precision, so padding changed the score.
    expect(clean).toBeGreaterThan(0.99);
    expect(padded).toBeCloseTo(clean, 5);
  });

  it('does not spuriously match empty tokens on both sides', async () => {
    const withoutPadding = await calculateMeteorScore('hi there', ['hi there']);
    const withPadding = await calculateMeteorScore(' hi there ', [' hi there ']);

    expect(withPadding).toBeCloseTo(withoutPadding, 5);
  });
});
