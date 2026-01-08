# Implementation Plan: Allow Caching When repeat > 1

**Issue:** #1431
**Goal:** Enable each repeat to have its own cache entry, so re-running evaluations uses cached results for all repeats.

## Current Behavior

```
Run 1 (repeat=3):
  - repeat 0: API call → cached
  - repeat 1: API call → NOT cached (bustCache=true)
  - repeat 2: API call → NOT cached (bustCache=true)

Run 2 (repeat=3):
  - repeat 0: Cache HIT ✓
  - repeat 1: API call (cache busted)
  - repeat 2: API call (cache busted)
```

## Desired Behavior

```
Run 1 (repeat=3):
  - repeat 0: API call → cached as "key"
  - repeat 1: API call → cached as "key:repeat1"
  - repeat 2: API call → cached as "key:repeat2"

Run 2 (repeat=3):
  - repeat 0: Cache HIT "key" ✓
  - repeat 1: Cache HIT "key:repeat1" ✓
  - repeat 2: Cache HIT "key:repeat2" ✓
```

## Implementation

### Phase 1: Update Cache Infrastructure

**File: `src/cache.ts`**

1. Create a new type for cache options:

```typescript
export type CacheOptions = {
  bust?: boolean;
  repeatIndex?: number;
};
```

2. Modify `fetchWithCache` signature to accept either boolean or options object (backward compatible):

```typescript
export async function fetchWithCache<T = any>(
  url: RequestInfo,
  options: RequestInit = {},
  timeout: number = REQUEST_TIMEOUT_MS,
  format: 'json' | 'text' = 'json',
  bustOrOptions: boolean | CacheOptions = false, // Changed
  maxRetries?: number,
): Promise<FetchWithCacheResult<T>>;
```

3. Update cache key generation:

```typescript
// Normalize the bust parameter
const cacheOpts: CacheOptions =
  typeof bustOrOptions === 'boolean' ? { bust: bustOrOptions } : bustOrOptions;
const { bust = false, repeatIndex } = cacheOpts;

// Generate cache key with optional repeat suffix
const baseKey = `fetch:v2:${url}:${JSON.stringify(copy)}`;
const cacheKey =
  repeatIndex !== undefined && repeatIndex > 0 ? `${baseKey}:repeat${repeatIndex}` : baseKey;
```

4. Update the bust check:

```typescript
if (!enabled || bust) {
  // ... existing bust logic
}
```

### Phase 2: Update Evaluator

**File: `src/evaluator.ts`**

Remove the `bustCache = true` logic for repeatIndex > 0 (lines 390-392):

```typescript
// REMOVE THIS:
if (repeatIndex > 0) {
  callApiContext.bustCache = true;
}
```

The `repeatIndex` is already passed in `callApiContext` (line 387), so providers will have access to it.

### Phase 3: Add Helper Function

**File: `src/cache.ts`** (export) or **`src/providers/shared.ts`**

Add a helper to convert context to cache options:

```typescript
import type { CallApiContextParams } from '../types/providers';

export function getCacheOptions(context?: CallApiContextParams): CacheOptions {
  return {
    bust: context?.bustCache ?? context?.debug,
    repeatIndex: context?.repeatIndex,
  };
}
```

### Phase 4: Update Providers (Incremental)

For each provider using `fetchWithCache`, update calls from:

```typescript
fetchWithCache(
  url,
  requestOptions,
  timeout,
  'json',
  context?.bustCache ?? context?.debug, // OLD
  maxRetries,
);
```

To:

```typescript
import { getCacheOptions } from '../cache';

fetchWithCache(
  url,
  requestOptions,
  timeout,
  'json',
  getCacheOptions(context), // NEW
  maxRetries,
);
```

**Files to update (87 call sites across these files):**

- `src/providers/openai/chat.ts`
- `src/providers/openai/completion.ts`
- `src/providers/openai/responses.ts`
- `src/providers/openai/transcription.ts`
- `src/providers/anthropic/messages.ts`
- `src/providers/azure/chat.ts`
- `src/providers/azure/completion.ts`
- `src/providers/azure/responses.ts`
- `src/providers/azure/assistant.ts`
- `src/providers/azure/embedding.ts`
- `src/providers/google/ai.studio.ts`
- `src/providers/google/vertex.ts`
- `src/providers/google/image.ts`
- `src/providers/google/gemini-image.ts`
- `src/providers/ollama.ts`
- `src/providers/openrouter.ts`
- `src/providers/http.ts`
- `src/providers/snowflake.ts`
- `src/providers/xai/responses.ts`
- `src/providers/cohere.ts`
- `src/providers/ai21.ts`
- `src/providers/watsonx.ts`
- `src/providers/hyperbolic/image.ts`
- `src/providers/hyperbolic/audio.ts`
- (and others)

**For providers with custom caching** (not using `fetchWithCache`):

- `src/providers/sagemaker.ts` - Update `getCacheKey()` to include repeatIndex
- `src/providers/bedrock/*.ts` - Update cache key generation
- `src/providers/anthropic/messages.ts` - Check if custom caching
- `src/providers/agentic-utils.ts` - Update `checkCacheAndPrepare()` to include repeatIndex

### Phase 5: Tests

**File: `test/cache.test.ts`**

```typescript
describe('fetchWithCache with repeatIndex', () => {
  it('should use same cache key for repeatIndex 0 and undefined', async () => {
    // Verify backward compatibility
  });

  it('should use different cache keys for different repeatIndex values', async () => {
    // Verify repeat1 and repeat2 get different keys
  });

  it('should cache each repeat separately', async () => {
    // First call makes request, second call hits cache
  });
});
```

**File: `test/evaluator.test.ts`**

```typescript
describe('repeat caching', () => {
  it('should cache all repeats with different keys', async () => {
    // Run eval with repeat=3
    // Verify each repeat has its own cache entry
  });

  it('should use cached results on second run', async () => {
    // Run eval with repeat=3 twice
    // Verify second run uses cached results for all repeats
  });
});
```

### Phase 6: Documentation

**File: `site/docs/configuration/caching.md`** (or similar)

Add section explaining:

- How repeat caching works
- Each repeat gets its own cache entry
- Re-running uses cached results
- Use `--no-cache` to force fresh results

## Rollout Strategy

This can be done incrementally:

1. **Phase 1-2**: Core changes (cache.ts, evaluator.ts) - enables the feature
2. **Phase 3**: Add helper function
3. **Phase 4**: Update providers one by one (can be multiple PRs)
4. **Phase 5-6**: Tests and docs

Providers not yet updated will continue to work (backward compatible) but won't benefit from repeat caching until updated.

## Backward Compatibility

- Old cache entries (without `:repeatN` suffix) continue to work for repeat 0
- Providers using old `bust: boolean` format continue to work
- No breaking changes to public API

## Edge Cases

1. **User wants fresh results every time**: Use `--no-cache` flag
2. **Mixed old/new providers**: Old providers bust cache for repeats, new ones cache
3. **Cache size concerns**: With repeat=10, 10x more cache entries - acceptable tradeoff

## Environment Variable (Optional Enhancement)

Consider adding `PROMPTFOO_CACHE_REPEATS=false` to disable repeat caching for users who want the old behavior (always bust cache for repeat > 0).

```typescript
const shouldCacheRepeats = getEnvBool('PROMPTFOO_CACHE_REPEATS', true);
if (!shouldCacheRepeats && repeatIndex > 0) {
  callApiContext.bustCache = true;
}
```

## Estimated Effort

| Phase                         | Effort    | Can Parallelize    |
| ----------------------------- | --------- | ------------------ |
| Phase 1: Cache infrastructure | 1-2 hours | No                 |
| Phase 2: Evaluator            | 15 mins   | No                 |
| Phase 3: Helper function      | 15 mins   | No                 |
| Phase 4: Update providers     | 3-4 hours | Yes (multiple PRs) |
| Phase 5: Tests                | 1-2 hours | Yes                |
| Phase 6: Documentation        | 30 mins   | Yes                |

**Total: ~6-8 hours**

## Success Criteria

1. Running `promptfoo eval --repeat 3` twice uses cached results for all 3 repeats on second run
2. Each repeat has a unique cache key
3. All existing tests pass
4. No breaking changes to existing behavior (without repeat)
