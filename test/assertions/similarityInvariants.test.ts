/**
 * Invariants that every text-similarity assertion should satisfy, asserted once
 * against all of them instead of separately in each metric's own file.
 *
 * Why a shared table: these metrics are maintained independently, so a property
 * can quietly hold in three of them and not the fourth. That is exactly how the
 * two defects already fixed in this family got in. ROUGE-L/ROUGE-S scored
 * identical text below 1.0 because the LCS tokens were deduplicated, and BLEU
 * scored a blank reference at 9.99e-8 while GLEU scored the same input 0. Both
 * were single-metric bugs that a cross-metric property would have caught on the
 * day they landed.
 *
 * Each invariant below is a claim about what these assertions MEAN, not about
 * how any one of them is implemented:
 *
 *   1. a perfect match scores 1
 *   2. scores stay inside [0, 1]
 *   3. comparison is case-insensitive
 *   4. multiple references take the best match, independent of their order
 *   5. an empty output never scores as a match
 *
 * Metrics are registered here by their public handler, which is the path a
 * config actually takes. Adding a new similarity assertion means adding one
 * line to METRICS, and the whole table runs against it.
 */
import { describe, expect, it } from 'vitest';
import { handleBleuScore } from '../../src/assertions/bleu';
import { handleGleuScore } from '../../src/assertions/gleu';
import { handleRougeScore } from '../../src/assertions/rouge';

import type { AssertionParams, GradingResult } from '../../src/types/index';

type Handler = (p: AssertionParams) => GradingResult | Promise<GradingResult>;

const METRICS: [string, Handler, string][] = [
  ['bleu', handleBleuScore as Handler, 'bleu'],
  ['gleu', handleGleuScore as Handler, 'gleu'],
  ['rouge-n', handleRougeScore as Handler, 'rouge-n'],
  ['rouge-l', handleRougeScore as Handler, 'rouge-l'],
  ['rouge-s', handleRougeScore as Handler, 'rouge-s'],
];

/** ROUGE asserts `renderedValue` is a string, so it has no multi-reference path. */
const MULTI_REF: [string, Handler, string][] = [
  ['bleu', handleBleuScore as Handler, 'bleu'],
  ['gleu', handleGleuScore as Handler, 'gleu'],
];

const SENTENCE = 'the cat sat on the mat';

async function score(
  handler: Handler,
  type: string,
  output: string,
  reference: string | string[],
): Promise<number> {
  const result = await handler({
    // `baseType` is what ROUGE reads to pick n/l/s; the others ignore it.
    baseType: type,
    assertion: { type, value: reference },
    renderedValue: reference,
    outputString: output,
    inverse: false,
  } as AssertionParams);
  return result.score;
}

describe.each(METRICS)('%s', (_name, handler, type) => {
  it('scores a perfect match as 1', async () => {
    expect(await score(handler, type, SENTENCE, SENTENCE)).toBeCloseTo(1, 10);
  });

  it.each([
    ['identical', SENTENCE, SENTENCE],
    ['partial', 'the dog sat on the mat', SENTENCE],
    ['disjoint', 'zebra quantum velvet', SENTENCE],
  ])('keeps %s inside [0, 1]', async (_case, output, reference) => {
    const s = await score(handler, type, output, reference);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });

  it('compares case-insensitively', async () => {
    const lower = await score(handler, type, SENTENCE, SENTENCE);
    const mixed = await score(handler, type, 'The Cat Sat On The Mat', SENTENCE);
    expect(mixed).toBeCloseTo(lower, 10);
  });

  it('never scores an empty output as a match', async () => {
    // Not "returns exactly 0": the claim is that nothing can be passed off as a
    // similarity. A metric smoothing an empty output to a small nonzero number
    // is reporting a resemblance it did not measure.
    expect(await score(handler, type, '', SENTENCE)).toBe(0);
  });
});

describe.each(MULTI_REF)('%s multi-reference', (_name, handler, type) => {
  it('takes the best reference regardless of the order they are given in', async () => {
    // A metric that scored the FIRST reference, or averaged them, would make the
    // result depend on how a config happens to list them.
    const bestFirst = await score(handler, type, SENTENCE, [SENTENCE, 'nothing alike at all']);
    const bestLast = await score(handler, type, SENTENCE, ['nothing alike at all', SENTENCE]);
    expect(bestFirst).toBeCloseTo(bestLast, 10);
    expect(bestFirst).toBeCloseTo(1, 10);
  });
});
