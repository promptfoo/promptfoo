# Per-Repeat Caching Implementation Plan

**GitHub Issue**: #1431 - Allow caching when `repeat > 1`

## Problem Statement

Currently, when running evaluations with `repeat > 1`, only the first repeat (index 0) gets cached. Repeats 1+ have `bustCache = true` forced, meaning:
- Re-running an evaluation doesn't use cached results for repeats 1+
- This wastes API calls and increases evaluation time

**Current behavior** (in `src/evaluator.ts:390-392`):
```typescript
if (repeatIndex > 0) {
  callApiContext.bustCache = true;
}
```

## Desired Behavior

Each repeat should have its own cache entry with a `:repeatN` suffix (where N > 0), so re-running evaluations uses cached results for ALL repeats.

**Cache key format**:
- Repeat 0: `fetch:v2:${url}:${options}` (unchanged for backward compatibility)
- Repeat 1: `fetch:v2:${url}:${options}:repeat1`
- Repeat N: `fetch:v2:${url}:${options}:repeatN`

---

## Implementation Overview

### Files to Modify

| Category | Files | Changes |
|----------|-------|---------|
| **Core Cache** | `src/cache.ts` | Add `CacheOptions` type, modify `fetchWithCache` signature |
| **Evaluator** | `src/evaluator.ts` | Remove `bustCache = true` for repeatIndex > 0 |
| **Types** | `src/types/providers.ts` | Add `repeatIndex` to `CallApiContextParams` (if not present) |
| **Provider Utils** | `src/providers/util.ts` | Add `getCacheOptions()` helper |
| **Agentic Utils** | `src/providers/agentic-utils.ts` | Add `repeatIndex` support |
| **Providers** | 35 files using `fetchWithCache` | Update to use `getCacheOptions()` |
| **Tests** | `test/cache.test.ts`, `test/providers/*.test.ts` | Add per-repeat caching tests |
| **Docs** | `site/docs/configuration/caching.md` | Document per-repeat caching |

---

## Detailed Implementation

### Phase 1: Core Cache Infrastructure

#### 1.1 Update `src/cache.ts`

Add `CacheOptions` type and update `fetchWithCache`:

```typescript
// Add new type after FetchWithCacheResult
export type CacheOptions = {
  bust?: boolean;
  repeatIndex?: number;
};

export async function fetchWithCache<T = any>(
  url: RequestInfo,
  options: RequestInit = {},
  timeout: number = REQUEST_TIMEOUT_MS,
  format: 'json' | 'text' = 'json',
  bustOrOptions: boolean | CacheOptions = false,  // Changed from `bust: boolean`
  maxRetries?: number,
): Promise<FetchWithCacheResult<T>> {
  // Normalize options
  const cacheOptions: CacheOptions = typeof bustOrOptions === 'boolean'
    ? { bust: bustOrOptions }
    : bustOrOptions;
  const { bust = false, repeatIndex } = cacheOptions;

  if (!enabled || bust) {
    // ... existing bust logic unchanged ...
  }

  const copy = Object.assign({}, options);
  delete copy.headers;

  // Generate cache key with repeat suffix
  let cacheKey = `fetch:v2:${url}:${JSON.stringify(copy)}`;
  if (repeatIndex != null && repeatIndex > 0) {
    cacheKey += `:repeat${repeatIndex}`;
  }

  // ... rest of function unchanged ...
}
```

**Key Design Decisions**:
- Backward compatible: `boolean` still works, converted to `CacheOptions`
- Repeat 0 uses original cache key (no suffix) for backward compatibility
- Only repeats 1+ get the `:repeatN` suffix

---

#### 1.2 Update `src/evaluator.ts`

Remove the forced cache bust for repeat > 0:

```typescript
// BEFORE (lines 390-392):
if (repeatIndex > 0) {
  callApiContext.bustCache = true;
}

// AFTER:
// Removed - repeatIndex is passed to providers which handle per-repeat caching
// The bustCache flag is now only set by --no-cache flag or debug mode
```

**Note**: The `repeatIndex` is already passed in `callApiContext` at line 387, so providers have access to it.

---

### Phase 2: Provider Utilities

#### 2.1 Add `getCacheOptions()` helper to `src/providers/util.ts`

```typescript
import type { CallApiContextParams } from '../types/providers';
import type { CacheOptions } from '../cache';

/**
 * Get cache options from provider call context.
 * Handles bustCache, debug mode, and per-repeat caching.
 */
export function getCacheOptions(context?: CallApiContextParams): CacheOptions {
  return {
    bust: context?.bustCache ?? context?.debug,
    repeatIndex: context?.repeatIndex,
  };
}
```

---

#### 2.2 Update `src/providers/agentic-utils.ts`

Update for per-repeat caching in agentic providers (Claude Agent SDK, OpenCode SDK):

```typescript
// Update AgenticCacheOptions interface
export interface AgenticCacheOptions {
  cacheKeyPrefix: string;
  workingDir?: string;
  bustCache?: boolean;
  repeatIndex?: number;  // ADD THIS
}

// Update generateCacheKey function
export function generateCacheKey(prefix: string, data: Record<string, unknown>): string {
  const stringified = JSON.stringify(data);
  const hash = crypto.createHash('sha256').update(stringified).digest('hex');

  // Add repeat suffix if repeatIndex > 0
  const repeatIndex = data.repeatIndex as number | undefined;
  const repeatSuffix = repeatIndex != null && repeatIndex > 0 ? `:repeat${repeatIndex}` : '';

  return `${prefix}:${hash}${repeatSuffix}`;
}

// Update initializeAgenticCache to pass repeatIndex through
export async function initializeAgenticCache(
  options: AgenticCacheOptions,
  cacheKeyData: Record<string, unknown>,
): Promise<CacheCheckResult> {
  // ... existing logic ...

  const cacheKey = generateCacheKey(options.cacheKeyPrefix, {
    ...cacheKeyData,
    workingDirFingerprint,
    repeatIndex: options.repeatIndex,  // ADD THIS
  });

  // ... rest unchanged ...
}
```

---

### Phase 3: Provider Updates

Update all providers that use `fetchWithCache` to use the new `getCacheOptions()` helper.

#### Standard Pattern

**BEFORE**:
```typescript
const response = await fetchWithCache(
  url,
  requestOptions,
  timeout,
  'json',
  context?.bustCache ?? context?.debug,
);
```

**AFTER**:
```typescript
import { getCacheOptions } from './util';

const response = await fetchWithCache(
  url,
  requestOptions,
  timeout,
  'json',
  getCacheOptions(context),
);
```

#### Files to Update (35 files)

**High-Priority Providers** (commonly used):
| File | Notes |
|------|-------|
| `src/providers/openai/chat.ts` | Line 433 |
| `src/providers/openai/completion.ts` | Line 95 |
| `src/providers/openai/responses.ts` | Line 341 |
| `src/providers/openai/transcription.ts` | Line 147 |
| `src/providers/openai/image.ts` | Check for fetchWithCache |
| `src/providers/openai/embedding.ts` | Check for fetchWithCache |
| `src/providers/openai/moderation.ts` | Check for fetchWithCache |
| `src/providers/azure/chat.ts` | Line 307 |
| `src/providers/azure/completion.ts` | Line 69 |
| `src/providers/azure/responses.ts` | Line 275 |
| `src/providers/azure/embedding.ts` | Check for fetchWithCache |
| `src/providers/azure/assistant.ts` | Check for fetchWithCache |
| `src/providers/google/ai.studio.ts` | Line 181 |
| `src/providers/ollama.ts` | Line 393 |
| `src/providers/http.ts` | Lines 2020, 2238 |

**Other Providers**:
| File | Notes |
|------|-------|
| `src/providers/openrouter.ts` | Line 139 |
| `src/providers/cohere.ts` | Check for fetchWithCache |
| `src/providers/mistral.ts` | Check for fetchWithCache |
| `src/providers/ai21.ts` | Check for fetchWithCache |
| `src/providers/watsonx.ts` | Check for fetchWithCache |
| `src/providers/replicate.ts` | Check for fetchWithCache |
| `src/providers/huggingface.ts` | Check for fetchWithCache |
| `src/providers/localai.ts` | Check for fetchWithCache |
| `src/providers/llama.ts` | Check for fetchWithCache |
| `src/providers/voyage.ts` | Check for fetchWithCache |
| `src/providers/snowflake.ts` | Line 125 |
| `src/providers/webhook.ts` | Check for fetchWithCache |
| `src/providers/docker.ts` | Check for fetchWithCache |
| `src/providers/cometapi.ts` | Check for fetchWithCache |
| `src/providers/aimlapi.ts` | Check for fetchWithCache |
| `src/providers/xai/responses.ts` | Line 344 |
| `src/providers/hyperbolic/audio.ts` | Check for fetchWithCache |
| `src/providers/hyperbolic/image.ts` | Check for fetchWithCache |
| `src/providers/google/gemini-image.ts` | Check for fetchWithCache |
| `src/providers/google/image.ts` | Check for fetchWithCache |

**Agentic Providers** (use custom caching):
| File | Notes |
|------|-------|
| `src/providers/claude-agent-sdk.ts` | Uses `initializeAgenticCache` - pass repeatIndex |
| `src/providers/opencode-sdk.ts` | Uses `initializeAgenticCache` - pass repeatIndex |

**Custom Cache Implementations**:
| File | Notes |
|------|-------|
| `src/providers/sagemaker.ts` | Has custom `getCacheKey()` - add repeat suffix |
| `src/providers/bedrock.ts` | Check for custom caching |

---

### Phase 4: Custom Cache Provider Updates

#### 4.1 SageMaker Provider

The SageMaker provider has its own caching mechanism. Update `getCacheKey()`:

```typescript
// In src/providers/sagemaker.ts
getCacheKey(
  prompt: string,
  config: Record<string, unknown>,
  repeatIndex?: number  // ADD parameter
): string {
  const base = JSON.stringify({ prompt, config });
  const repeatSuffix = repeatIndex != null && repeatIndex > 0 ? `:repeat${repeatIndex}` : '';
  return `sagemaker:${SHA256(base).toString()}${repeatSuffix}`;
}
```

#### 4.2 Azure Assistant Provider

Check if `azure/assistant.ts` has custom caching - update similarly.

---

### Phase 5: Testing

#### 5.1 Core Cache Tests (`test/cache.test.ts`)

```typescript
describe('fetchWithCache with repeatIndex', () => {
  it('should use same cache key for repeat 0 and no repeat', async () => {
    // Both should hit the same cache entry
    await fetchWithCache(url, options, timeout, 'json', { repeatIndex: 0 });
    await fetchWithCache(url, options, timeout, 'json', false);
    // Assert only one cache entry
  });

  it('should create separate cache entries for different repeatIndex values', async () => {
    await fetchWithCache(url, options, timeout, 'json', { repeatIndex: 0 });
    await fetchWithCache(url, options, timeout, 'json', { repeatIndex: 1 });
    await fetchWithCache(url, options, timeout, 'json', { repeatIndex: 2 });
    // Assert three cache entries with different keys
  });

  it('should return cached response for same repeatIndex', async () => {
    const result1 = await fetchWithCache(url, options, timeout, 'json', { repeatIndex: 1 });
    const result2 = await fetchWithCache(url, options, timeout, 'json', { repeatIndex: 1 });
    expect(result2.cached).toBe(true);
  });

  it('should bust cache when bust=true regardless of repeatIndex', async () => {
    await fetchWithCache(url, options, timeout, 'json', { repeatIndex: 1 });
    const result = await fetchWithCache(url, options, timeout, 'json', { bust: true, repeatIndex: 1 });
    expect(result.cached).toBe(false);
  });

  it('should maintain backward compatibility with boolean bust parameter', async () => {
    // Old signature should still work
    await fetchWithCache(url, options, timeout, 'json', true);  // bust
    await fetchWithCache(url, options, timeout, 'json', false); // no bust
  });
});
```

#### 5.2 Provider Helper Tests (`test/providers/util.test.ts`)

```typescript
describe('getCacheOptions', () => {
  it('should return bust=false and no repeatIndex when context is undefined', () => {
    expect(getCacheOptions(undefined)).toEqual({ bust: undefined, repeatIndex: undefined });
  });

  it('should extract bustCache from context', () => {
    expect(getCacheOptions({ bustCache: true })).toEqual({ bust: true, repeatIndex: undefined });
  });

  it('should fall back to debug for bust', () => {
    expect(getCacheOptions({ debug: true })).toEqual({ bust: true, repeatIndex: undefined });
  });

  it('should extract repeatIndex from context', () => {
    expect(getCacheOptions({ repeatIndex: 2 })).toEqual({ bust: undefined, repeatIndex: 2 });
  });
});
```

#### 5.3 Integration Tests

Add integration test to verify per-repeat caching works end-to-end with a real evaluation.

---

### Phase 6: Documentation

#### 6.1 Update `site/docs/configuration/caching.md`

Add section:

```markdown
## Per-Repeat Caching

When using `repeat` in your configuration to run multiple evaluations, each repeat
gets its own cache entry. This means:

- Re-running an evaluation with `repeat: 3` will use cached results for all 3 repeats
- Each repeat has a unique cache key with a `:repeatN` suffix (for N > 0)
- Repeat 0 uses the original cache key for backward compatibility

### Example

```yaml
providers:
  - openai:gpt-4
tests:
  - vars:
      question: "What is 2+2?"
repeat: 3
```

Running this config twice will use cached results for all 3 repeats the second time,
significantly speeding up evaluation.

### Disabling Per-Repeat Caching

To force fresh API calls for all repeats, use the `--no-cache` flag:

```bash
promptfoo eval --no-cache
```
```

---

## Rollout Strategy

### Step 1: Core Infrastructure (Low Risk)
1. Add `CacheOptions` type to `src/cache.ts`
2. Update `fetchWithCache` signature (backward compatible)
3. Add `getCacheOptions()` helper to `src/providers/util.ts`
4. Add core tests

### Step 2: Remove Forced Bust (Medium Risk)
1. Remove `bustCache = true` for repeatIndex > 0 in evaluator.ts
2. This changes behavior but caching is generally expected

### Step 3: Update Providers (Low Risk, High Volume)
1. Update high-priority providers first (OpenAI, Azure, Google, Ollama)
2. Update remaining providers
3. Update agentic providers (Claude Agent SDK, OpenCode SDK)
4. Update custom cache providers (SageMaker, Bedrock)

### Step 4: Documentation & Release
1. Update caching documentation
2. Add to CHANGELOG
3. Release with clear notes about new per-repeat caching behavior

---

## Backward Compatibility Notes

1. **`fetchWithCache` signature**: Fully backward compatible. Boolean `bust` parameter still works.

2. **Cache key format**:
   - Repeat 0 uses original format (no suffix) - existing cache entries remain valid
   - Only repeats 1+ get new `:repeatN` suffix

3. **Evaluator behavior**: After this change, repeats 1+ will be cached by default. Users who relied on fresh API calls for repeats will need to use `--no-cache`.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing workflows relying on fresh calls for repeats | Document change clearly; `--no-cache` flag available |
| Large number of files to update | Use consistent pattern; can be done incrementally |
| Custom cache implementations missed | Grep for `getCacheKey`, `cacheKey`, custom cache patterns |
| Performance impact from longer cache keys | Minimal - only adds small suffix |

---

## Verification Checklist

- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] Core cache tests pass with per-repeat scenarios
- [ ] Provider tests verify cache options are passed correctly
- [ ] Integration test confirms repeats are cached
- [ ] Documentation updated
- [ ] CHANGELOG entry added

---

## Appendix: Full File Change List

### Core Files
- `src/cache.ts` - Add `CacheOptions` type, update `fetchWithCache`
- `src/evaluator.ts` - Remove forced bustCache for repeatIndex > 0
- `src/providers/util.ts` - Add `getCacheOptions()` helper
- `src/providers/agentic-utils.ts` - Add repeatIndex support

### Provider Files (35 total)
See Phase 3 table above for complete list.

### Test Files
- `test/cache.test.ts` - Per-repeat caching tests
- `test/providers/util.test.ts` - getCacheOptions tests
- `test/integration/repeat-caching.test.ts` - Integration tests

### Documentation
- `site/docs/configuration/caching.md` - Per-repeat caching docs
