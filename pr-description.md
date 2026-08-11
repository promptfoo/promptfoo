# fix(assertions): enforce inverse similarity boundary

## Problem

`not-similar` is documented as the logical inverse of `similar`, but both assertions
could pass when a score was exactly at the configured threshold. The same overlap
affected negated Euclidean-distance assertions.

This happened because the positive and inverse paths used separate inclusive
comparisons with floating-point tolerance. At the boundary, each comparison evaluated
to `true`, so negating the assertion type did not reliably negate its result.

## Solution

- Calculate the positive threshold result once and invert that boolean for
  `not-similar`.
- Preserve the existing floating-point tolerance for the positive comparison.
- Apply the same behavior to cosine, dot-product, and Euclidean metrics.
- Add regression coverage for exact similarity and distance thresholds.

## Test plan

- `npx vitest run test/matchers/similarity.test.ts test/assertions/similar.test.ts`
- 37 tests passed.
