# UI Performance Analysis - First Principles

**Date**: 2025-12-11
**Status**: ✅ Phase 1-4 Complete

## Summary of Improvements (2025-12-11)

### Phase 1-2: Event Merging & Bug Fixes

| Change                | Before                 | After           | Impact            |
| --------------------- | ---------------------- | --------------- | ----------------- |
| Dispatches per test   | 3                      | 1-2             | 50-67% reduction  |
| Double-counting bug   | Errors counted twice   | Fixed           | Correct counts    |
| Event merging         | TEST_RESULT + PROGRESS | Single PROGRESS | Simpler flow      |
| TICK interval         | 1000ms                 | 250ms           | Smoother activity |
| Activity highlighting | Single provider        | Multi-provider  | Better feedback   |

### Phase 3: Batched Updates

| Change             | Before                 | After                 | Impact                   |
| ------------------ | ---------------------- | --------------------- | ------------------------ |
| Updates per 50ms   | Unbounded (1 per test) | Max 1 batch           | 95%+ reduction at -j 100 |
| First item latency | Same as all            | Immediate             | Responsive feedback      |
| Batch flush        | N/A                    | 50ms throttle         | Max 20 updates/sec       |
| Cleanup            | N/A                    | Automatic on complete | No memory leaks          |

**Architecture:**

```
Test completions ──┬─► First: Immediate PROGRESS dispatch (responsive)
                   │
                   └─► Subsequent: Queue ──► 50ms ──► BATCH_PROGRESS dispatch
                                    ↑                        │
                                    └────── Timer reset ─────┘
```

**Benefits at -j 100:**

- Without batching: ~100 dispatches per completion wave
- With batching: ~2-3 dispatches per 50ms window
- Re-renders reduced by 95%+

### Token Tracking (Verified Unaffected)

Token tracking uses a **separate path** from progress batching:

```
Provider API call → TokenUsageTracker.trackUsage() → useTokenMetrics subscription
                                                            │
                                                            ▼
                                                   UPDATE_TOKEN_METRICS dispatch
                                                            │
                                                            ▼
                                                   UPDATE_TOKENS in state machine
```

- Regular tokens flow through `TokenUsageTracker` singleton (independent of batching)
- Grading tokens dispatched directly via `SET_GRADING_TOKENS` (not batched)
- Cost/latency ARE batched in `BATCH_PROGRESS` but accumulate correctly

**Fix Applied**: Provider ID mismatch when using labels:

- Changed `evaluator.ts` to use `provider.label || provider.id()` for token tracking
- This matches the state machine provider keys used by the Ink UI

### Phase 4: UI Flickering Fix (Component Memoization)

**Root Causes Identified:**

1. Spinner animation updating every 80ms → triggering parent re-renders
2. `Date.now()` calculated on every render → causing `isActive` prop changes
3. No memoization on key components → unnecessary re-renders cascading
4. TICK event (250ms) re-rendering entire component tree

**Fixes Applied:**
| Change | Before | After | Impact |
|--------|--------|-------|--------|
| ProviderRow | Plain function | `React.memo` with custom comparator | Only re-renders on data change |
| TableHeader | Plain function | `React.memo` | Never re-renders (static) |
| Activity timestamp | `Date.now()` every render | `useState` updated on TICK only | Stable between TICKs |
| Spinner interval | 80ms | 120ms | 33% fewer spinner re-renders |

**Key Implementation Details:**

1. **ProviderRow memoization** with custom prop comparison:
   - Compares all primitive props and nested object values
   - Prevents re-render when only parent state changes but row data is unchanged

2. **Stabilized `activityNow` timestamp**:
   - Uses `useState(Date.now)` initialized once
   - Only updates via `setActivityNow(Date.now())` inside TICK effect
   - Prevents `isActive` calculation from changing between TICKs

3. **Spinner optimization**:
   - Increased default interval from 80ms to 120ms
   - Still smooth animation (8.3 fps) with 33% fewer updates

**Result:** Significantly reduced flickering during high-concurrency evaluations.

## Current Data Flow

```
Evaluator (async, concurrent)
    │
    ▼
Progress Callback (fires per test completion)
    │
    ▼
evalBridge.createProgressCallback()
    │
    ├─► dispatch(TEST_RESULT)      ─┐
    ├─► dispatch(SET_GRADING_TOKENS) │  3 separate dispatches
    └─► dispatch(PROGRESS)         ─┘
            │
            ▼
    actionToEvent() adapter
            │
            ▼
    XState machine.send()
            │
            ▼
    Machine processes event, updates context
            │
            ▼
    useMachine() triggers React state update
            │
            ▼
    Component re-render
            │
            ▼
    Ink writes to terminal
```

## Identified Issues

### Issue 1: Double-Counting Bug (CRITICAL)

In `actionToEvent()` (EvalContext.tsx:262-264):

```typescript
passedDelta: passed === true ? 1 : 0,
failedDelta: passed === false ? 1 : 0,  // BUG: Counts errors as failures!
errorDelta: error ? 1 : 0,
```

**Problem**: When `passed === false && error === 'Test error'`:

- `passedDelta = 0` ✓
- `failedDelta = 1` ✗ (should be 0 for errors)
- `errorDelta = 1` ✓

**Result**: Errors are counted as BOTH failures AND errors.

**Fix**:

```typescript
failedDelta: passed === false && !error ? 1 : 0,
```

### Issue 2: Multiple Dispatches Per Test

Each test completion triggers 3 separate dispatches:

1. `TEST_RESULT` - latency, cost per provider
2. `SET_GRADING_TOKENS` - grading token usage (conditional)
3. `PROGRESS` - pass/fail/error counts, provider status

With `-j 100` and 1000 tests:

- 3000+ dispatches minimum
- Each dispatch → state update → potential re-render

### Issue 3: Object Spreading Overhead

In `updateProgress` action:

```typescript
providers = {
  ...providers, // O(n) - copy all providers
  [provider]: {
    ...providers[provider], // Copy all provider fields
    testCases: {
      ...providers[provider].testCases, // Copy test cases
      completed: providers[provider].testCases.completed + 1,
    },
  },
};
```

With 8 providers and 1000 tests = 8000 object spread operations.

### Issue 4: No Batching

Concurrent test completions trigger individual dispatches rather than batched updates.

```
Time ─────────────────────────────────────────►
      │ Test1  │ Test2  │ Test3  │ Test4  │
      │complete│complete│complete│complete│
      ▼        ▼        ▼        ▼
   dispatch dispatch dispatch dispatch
      │        │        │        │
   render   render   render   render  (4 renders)
```

Should be:

```
Time ─────────────────────────────────────────►
      │ Test1  │ Test2  │ Test3  │ Test4  │
      │complete│complete│complete│complete│
      ▼        ▼        ▼        ▼
   queue     queue    queue    queue
                           │
                     flush (50ms)
                           │
                        render (1 render)
```

### Issue 5: TICK Continues Unnecessarily

TICK fires every 250ms even when evaluation is complete, causing unnecessary re-renders.

## Performance Optimization Plan

### Phase 1: Fix Bugs (Immediate)

1. **Fix double-counting** - Change `failedDelta` calculation
2. **Stop TICK after completion** - Already conditional on phase, verify it works

### Phase 2: Reduce Dispatches (High Impact)

**Option A: Merge Events**
Combine TEST_RESULT and PROGRESS into single `TEST_COMPLETE` event:

```typescript
type: 'TEST_COMPLETE',
payload: {
  providerId: string,
  result: 'pass' | 'fail' | 'error',
  latencyMs: number,
  cost: number,
  gradingTokens?: GradingTokens,
  completed: number,
  total: number,
}
```

Benefits:

- 2 dispatches → 1 dispatch per test (50% reduction)
- Single state update per test
- Simpler code

### Phase 3: Batched Updates (Highest Impact)

Implement throttled batching:

```typescript
// In evalBridge.ts
const pendingUpdates: TestResult[] = [];
let flushScheduled = false;

function queueUpdate(result: TestResult) {
  pendingUpdates.push(result);
  if (!flushScheduled) {
    flushScheduled = true;
    setTimeout(flushUpdates, 50); // 20 updates/sec max
  }
}

function flushUpdates() {
  if (pendingUpdates.length > 0) {
    dispatch({
      type: 'BATCH_TEST_COMPLETE',
      payload: { results: [...pendingUpdates] },
    });
    pendingUpdates.length = 0;
  }
  flushScheduled = false;
}
```

Benefits:

- With `-j 100`: 100 concurrent → batched into ~2-3 dispatches per 50ms
- Dramatically reduces re-renders
- Terminal output becomes smoother

### Phase 4: Efficient State Updates (Medium Impact)

Use Immer for efficient immutable updates:

```typescript
import { produce } from 'immer';

updateProgress: assign(({ context, event }) =>
  produce(context, draft => {
    const provider = draft.providers[event.provider];
    provider.testCases.completed++;
    provider.lastActivityMs = Date.now();
    // Direct mutation, Immer handles immutability
  })
),
```

Or use structural sharing manually:

```typescript
// Only create new objects for changed paths
const newTestCases = { ...provider.testCases, completed: provider.testCases.completed + 1 };
// Reuse unchanged objects
```

## "Last Progress Bar Not Updating" Investigation

Possible causes:

1. **Double-counting bug** - Total doesn't match expected
2. **Race condition** - COMPLETE fires before final PROGRESS renders
3. **TICK timing** - Last render happens before final state update

**Test**: Add logging to track:

```typescript
console.log(`PROGRESS: completed=${completed}/${total}, provider=${provider}`);
console.log(`State after: completedTests=${state.completedTests}`);
```

## Recommended Implementation Order

1. **Fix double-counting bug** (5 min, highest ROI)
2. **Test with logging** to identify "last progress bar" issue
3. **Implement batching** (2 hours, biggest perf win)
4. **Merge events** if batching isn't sufficient

## Performance Targets

| Metric                | Current            | Target             |
| --------------------- | ------------------ | ------------------ |
| Dispatches per test   | 3                  | 1 (batched)        |
| Re-renders per second | 100+ (with -j 100) | 20 max             |
| Object allocations    | O(n) per update    | O(1) with batching |
| Terminal writes       | Per dispatch       | Per batch (50ms)   |
