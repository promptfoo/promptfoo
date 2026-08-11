# fix(assertions): enforce inverse similarity boundary

## Summary

- Make `not-similar` the exact logical inverse of `similar`.
- Prevent positive and negated assertions from both passing at the threshold boundary.
- Apply consistent behavior to cosine, dot-product, and Euclidean metrics.
- Add regression coverage for exact similarity and distance thresholds.

## Test plan

- `npx vitest run test/matchers/similarity.test.ts test/assertions/similar.test.ts`
- 37 tests passed.
