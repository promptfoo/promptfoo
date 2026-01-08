# Implementation Plan: Display Total Evaluation Duration in UI

**GitHub Issue:** #1730 - Is there a way to see the time taken to run the entire test cases of a test suite from the UI?

**Date:** 2024-12-14

---

## Problem Statement

Users want to see how long their entire evaluation suite took to run, visible in the web UI. Currently:

- Individual test `latencyMs` is captured and displayed
- Per-prompt `totalLatencyMs` is aggregated and shown as averages
- Wall-clock evaluation duration (`totalEvalTimeMs`) is calculated but only used for telemetry — not persisted or displayed

## Key Discovery: No Schema Migration Required

The `results` column in `evalsTable` stores data as a JSON blob:

```typescript
// src/database/tables.ts:63
results: text('results', { mode: 'json' }).$type<EvaluateSummaryV2 | object>().notNull(),
```

`EvaluateStats` lives inside this JSON structure:

```typescript
// EvaluateSummaryV3 → stats: EvaluateStats
interface EvaluateStats {
  successes: number;
  failures: number;
  errors: number;
  tokenUsage: Required<TokenUsage>;
  // durationMs would go here
}
```

**Adding an optional field to `EvaluateStats` requires NO database migration** — it's just a TypeScript type change. Old evals will have `durationMs: undefined`, which is handled gracefully.

---

## Option B: Persist Wall-Clock Duration (Recommended)

### Overview

Add `durationMs` to `EvaluateStats`, populate it during evaluation, and display in the UI header.

### Changes Required

#### 1. Type Definition (`src/types/index.ts`)

```typescript
export interface EvaluateStats {
  successes: number;
  failures: number;
  errors: number;
  tokenUsage: Required<TokenUsage>;
  durationMs?: number; // NEW: wall-clock time in milliseconds
}
```

**Why optional?** Backward compatibility — existing evals won't have this field.

#### 2. Evaluator Changes (`src/evaluator.ts`)

The duration is already calculated at line ~1846:

```typescript
const endTime = Date.now();
const totalEvalTimeMs = endTime - startTime;
```

Need to include it when building the final results object (~line 1880):

```typescript
this.evalRecord.results = {
  version: 3,
  timestamp: new Date().toISOString(),
  prompts,
  results: this.evalRecord.results as EvaluateResult[],
  stats: {
    successes: this.stats.successes,
    failures: this.stats.failures,
    errors: this.stats.errors,
    tokenUsage: aggregatedTokenUsage,
    durationMs: totalEvalTimeMs, // NEW
  },
};
```

#### 3. Eval Model (`src/models/eval.ts`)

Update `getStats()` method (~line 1000) to include `durationMs` if available:

```typescript
getStats(): EvaluateStats {
  const stats: EvaluateStats = {
    successes: 0,
    failures: 0,
    errors: 0,
    tokenUsage: createEmptyTokenUsage(),
  };

  // If we have persisted stats with durationMs, include it
  if (this.results?.stats?.durationMs !== undefined) {
    stats.durationMs = this.results.stats.durationMs;
  }

  // ... rest of method
}
```

#### 4. Frontend Display (`src/app/src/pages/eval/components/ResultsView.tsx`)

Add duration display in the header area (near line ~731 where result count is shown):

**Data access:** Stats are available via the store — need to verify the exact path. Likely through:

- `table.head.prompts[0].metrics` (has `totalLatencyMs` but not suite duration)
- Or need to expose `stats` from the eval record via API

**Display format:**

```tsx
{stats?.durationMs && (
  <Chip
    size="small"
    label={`Duration: ${formatDuration(stats.durationMs)}`}
    sx={{ ... }}
  />
)}
```

**Formatting helper:**

```typescript
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}
```

#### 5. API/Store Integration

Need to verify how `stats` flows to the frontend. Check:

- `src/server/routes/eval.ts` — what's returned in the eval endpoint
- `src/app/src/pages/eval/components/store.ts` — what's stored client-side

May need to:

- Add `stats` to the `EvalTableDTO` if not already included
- Update the store to track `stats`

#### 6. Documentation (`site/docs/configuration/reference.md`)

Update the `EvaluateStats` interface documentation (~line 807):

```typescript
interface EvaluateStats {
  successes: number;
  failures: number;
  errors: number;
  tokenUsage: Required<TokenUsage>;
  durationMs?: number; // Wall-clock duration of the evaluation in milliseconds
}
```

### Files to Modify

| File                                                | Change                                              |
| --------------------------------------------------- | --------------------------------------------------- |
| `src/types/index.ts`                                | Add `durationMs?: number` to `EvaluateStats`        |
| `src/evaluator.ts`                                  | Include `durationMs` in stats when building results |
| `src/models/eval.ts`                                | Handle `durationMs` in `getStats()`                 |
| `src/app/src/pages/eval/components/ResultsView.tsx` | Display duration chip                               |
| `src/app/src/pages/eval/components/store.ts`        | May need to expose stats                            |
| `src/server/routes/eval.ts`                         | May need to include stats in response               |
| `site/docs/configuration/reference.md`              | Document new field                                  |

### Testing

1. **Unit test** for duration calculation in evaluator
2. **Unit test** for `formatDuration` helper
3. **Integration test** verifying duration persists and loads correctly
4. **Manual test** with new eval, verify duration displays
5. **Manual test** with old eval (no `durationMs`), verify graceful handling

### Edge Cases

| Scenario                      | Behavior                                            |
| ----------------------------- | --------------------------------------------------- |
| Old eval without `durationMs` | Don't show duration chip                            |
| Very fast eval (<1s)          | Show `342ms`                                        |
| Long eval (>1h)               | Show `1h 23m`                                       |
| Eval in progress              | Show elapsed time with spinner (future enhancement) |
| Cancelled eval                | Show duration up to cancellation                    |

---

## Option A: Frontend-Only Fallback

If Option B proves more complex than expected, this is a simpler alternative.

### Overview

Calculate total duration client-side by summing `totalLatencyMs` from all prompts.

### Implementation

```typescript
// In ResultsView.tsx or a hook
const cumulativeLatency = useMemo(() => {
  return (
    table?.head?.prompts?.reduce((sum, prompt) => sum + (prompt.metrics?.totalLatencyMs || 0), 0) ||
    0
  );
}, [table]);
```

### Limitations

1. **Shows cumulative time, not wall-clock time**
   - With concurrency=10, 100 tests at 500ms each = 50,000ms cumulative but ~5,000ms wall-clock
   - Could be confusing/misleading

2. **Label must be clear**
   - "Total API Time" or "Cumulative Latency" instead of "Duration"
   - Include tooltip explaining the difference

3. **Doesn't capture evaluation overhead**
   - Test generation, assertion evaluation, file I/O not included

### When to Use Option A

- As interim solution while Option B is in review
- If backend changes face unexpected blockers
- As additional metric alongside wall-clock duration

---

## Recommendation

**Proceed with Option B** because:

1. No database migration required
2. Captures actual wall-clock time users care about
3. Data already calculated, just needs persistence
4. Clean, targeted change with clear scope

**Keep Option A in mind** as:

- Fallback if complications arise
- Potentially useful as a secondary metric (show both wall-clock and cumulative)

---

## Open Questions

1. **Where exactly should duration display in UI?**
   - Next to result count in header?
   - In a metrics summary bar?
   - In eval selector dropdown?

2. **Should we also show cumulative API time?**
   - Useful for understanding cost/efficiency
   - Could show both: "Duration: 45s (API time: 3m 20s)"

3. **Real-time duration for in-progress evals?**
   - Show elapsed time while eval is running
   - Would require WebSocket updates or polling
   - Consider as future enhancement

4. **CLI output?**
   - Should `promptfoo eval` print duration at the end?
   - Currently only shown in telemetry

---

## Implementation Order

1. Add `durationMs` to `EvaluateStats` type
2. Populate in `evaluator.ts` when building final results
3. Verify it persists correctly (manual test with `npm run local -- eval`)
4. Trace data flow to frontend, add to store if needed
5. Add UI display in `ResultsView.tsx`
6. Add formatting helper
7. Write tests
8. Update documentation
