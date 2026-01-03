# Fix Plan: Custom Provider Cached latencyMs Ignored (#6910)

## Problem Summary

Custom providers returning `latencyMs` in their `ProviderResponse` have this value ignored. The evaluator always overwrites it with its own measured time, causing cached responses to show ~1-10ms latency instead of the original provider-reported latency.

## Root Cause

In `src/evaluator.ts:464`, the `EvaluateResult` is created with the locally measured `latencyMs`:

```typescript
const ret: EvaluateResult = {
  // ...
  latencyMs,  // BUG: Uses evaluator's measurement, ignores response.latencyMs
  // ...
};
```

The correct pattern (`response.latencyMs ?? latencyMs`) already exists at line 563 for assertions, but was never applied to the result itself.

## Fix Implementation

### Step 1: Primary Code Change

**File:** `src/evaluator.ts`
**Line:** 464

Change from:
```typescript
latencyMs,
```

To:
```typescript
latencyMs: response.latencyMs ?? latencyMs,
```

This prefers the provider-supplied latency (which includes cached original latency) while falling back to the evaluator's measurement when the provider doesn't supply one.

### Step 2: Add Unit Tests

**File:** `test/evaluator.test.ts`

Add test cases to verify:

1. **Provider-supplied latencyMs is respected:**
   ```typescript
   it('uses provider-supplied latencyMs when available', async () => {
     // Mock provider that returns latencyMs: 5000
     // Verify result.latencyMs === 5000, not the ~0ms evaluator measurement
   });
   ```

2. **Fallback to measured latency when provider doesn't supply it:**
   ```typescript
   it('falls back to measured latency when provider does not supply latencyMs', async () => {
     // Mock provider that returns no latencyMs
     // Verify result.latencyMs is the evaluator's measurement (> 0)
   });
   ```

3. **Cached responses preserve original latency:**
   ```typescript
   it('preserves original latencyMs for cached provider responses', async () => {
     // Mock provider returning cached: true with latencyMs: 3000
     // Verify result.latencyMs === 3000
   });
   ```

4. **Zero latency is respected (edge case for nullish coalescing):**
   ```typescript
   it('respects provider latencyMs of 0', async () => {
     // Mock provider returning latencyMs: 0
     // Verify result.latencyMs === 0, not the evaluator's measurement
   });
   ```

### Step 3: Verify Related Code Paths

Audit these locations to ensure consistency:

| Location | Current Behavior | Action Needed |
|----------|-----------------|---------------|
| `evaluator.ts:464` | Uses local `latencyMs` | **FIX** |
| `evaluator.ts:563` | Uses `response.latencyMs ?? latencyMs` | None (correct) |
| `evaluator.ts:1360` | Uses `row.latencyMs` from result | None (will be correct after fix) |
| `evaluator.ts:1450` | Timeout result uses `timeoutMs` | None (intentional for timeouts) |
| `evaluator.ts:1902` | Max duration timeout uses measured | None (intentional for timeouts) |

### Step 4: Integration Test

**File:** `test/evaluator.integration.test.ts` (or add to existing)

Create an end-to-end test with a mock custom provider:

```typescript
it('custom provider cached latencyMs flows through to results', async () => {
  const mockProvider = {
    id: () => 'mock-cached-provider',
    callApi: async () => ({
      output: 'test output',
      cached: true,
      latencyMs: 12345,  // Simulated original latency
    }),
  };

  const result = await evaluate(/* ... with mockProvider ... */);

  expect(result.results[0].latencyMs).toBe(12345);
  expect(result.results[0].response.cached).toBe(true);
});
```

## Verification Checklist

- [ ] Primary fix applied to `src/evaluator.ts:464`
- [ ] Unit tests added and passing
- [ ] Integration test added and passing
- [ ] Existing tests still pass (`npm test`)
- [ ] Manual verification with a custom provider returning cached latency
- [ ] Lint and format pass (`npm run l && npm run f`)

## Manual Testing Steps

1. Create a test config with a custom provider:
   ```yaml
   providers:
     - file://test-cached-provider.js
   ```

2. Create `test-cached-provider.js`:
   ```javascript
   module.exports = {
     id: () => 'test-cached',
     callApi: async (prompt) => ({
       output: `Response to: ${prompt}`,
       cached: true,
       latencyMs: 5000,  // Should show as 5000ms in UI
     }),
   };
   ```

3. Run evaluation:
   ```bash
   npm run local -- eval -c test-config.yaml --no-cache
   ```

4. Verify in web UI that latency shows "5000 ms (cached)" not "< 10 ms (cached)"

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing behavior | Very Low | Low | Nullish coalescing preserves fallback |
| Performance regression | None | N/A | No additional computation |
| Test failures | Low | Low | Fix any tests that incorrectly expect measured latency |

## PR Checklist

- [ ] Title follows convention: `fix(evaluator): respect provider-supplied latencyMs for cached responses`
- [ ] Links to issue #6910
- [ ] Includes tests
- [ ] No unrelated changes
- [ ] Passes CI

## Notes

- This is a 1-line fix with high confidence
- The pattern already exists in the codebase (line 563)
- PR #5978 intended to fix this but missed this specific location
- Affects all custom providers using their own caching mechanism
