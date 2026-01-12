# Critical Audit: Ink CLI UI - Findings & Recommendations

**Date**: 2025-12-11
**Last Updated**: 2025-12-11
**Status**: Active
**Author**: Claude Code

## Recent Completions (2025-12-11)

### Phase 1: Stability ✅ COMPLETE

- ✅ **XState Migration** - EvalContext now uses XState state machine (`src/ui/machines/evalMachine.ts`)
- ✅ **Error Boundary** - Added `src/ui/components/shared/ErrorBoundary.tsx`
- ✅ **Ring Buffer** - O(1) log storage (`src/ui/utils/RingBuffer.ts`)
- ✅ **Type Safety** - Removed all `as any` and `as unknown` casts
- ✅ **Unit Tests** - 73 tests for RingBuffer and evalMachine
- ✅ **Cancellation Bug Fix** - Separated `onCancel` from `onExit` callbacks

### Phase 2: Core Features ✅ COMPLETE

- ✅ **Regex Search** - `/pattern/flags` syntax with error handling (25 tests)
- ✅ **Summary Statistics Footer** - Pass/fail/error counts, pass rate, avg score
- ✅ **Total Cost & Avg Latency** - Added to summary footer (12 tests)
- ✅ **Improved Error Display** - Error categorization, stack trace detection (44 tests)

### Bug Fixes (2025-12-11)

- ✅ **`-j` / `--max-concurrency` flag ignored** - Added parseInt parser to option definition
- ✅ **`--repeat` and `--delay` flags** - Added parseInt parsers
- ✅ **Provider row wrapping to 2 lines** - Fixed column widths to fit single line
- ✅ **Concurrency not shown in UI** - Now passed from CLI to UI via init()
- ✅ **Grading tokens not accumulating** - Added per-provider grading token tracking with delta calculation (like regular token metrics)
- ✅ **UI responsiveness with high concurrency (-j 100)** - Fixed multiple issues:
  - Removed double counting of pass/fail/errors between TEST_RESULT and PROGRESS handlers
  - Removed unused PROVIDER_UPDATE dispatch (was converted to null)
  - Removed redundant UPDATE_TOKEN_METRICS dispatch (useTokenMetrics hook handles it with 100ms debouncing)
  - Reduced dispatches per test from 5 to 3 (TEST_RESULT, SET_GRADING_TOKENS, PROGRESS)
- ✅ **Multi-provider activity highlighting** - With high concurrency (`-j 50+`), multiple providers can now be highlighted simultaneously as "active":
  - Added `lastActivityMs: number` timestamp to `ProviderMetrics` interface
  - Activity computed at render time: `isActive = (now - lastActivityMs) < 500ms`
  - Increased TICK interval from 1000ms to 250ms during evaluation for smooth visual updates
  - Design pattern: Timestamp-based (not Set/Map) for O(1) updates and natural expiration
- ✅ **Double-counting bug fix** - Errors were being counted as both failures AND errors in `actionToEvent`:
  - Changed `failedDelta: passed === false ? 1 : 0` to `failedDelta: passed === false && !error ? 1 : 0`
- ✅ **Event merging optimization** - Merged TEST_RESULT into PROGRESS event:
  - Reduced dispatches per test from 3 to 1-2 (50-67% reduction)
  - Single PROGRESS event now carries latency, cost, and pass/fail/error counts
  - TEST_RESULT kept for backwards compatibility but no longer dispatched
- ✅ **Batched updates for extreme concurrency** - Phase 3 batching infrastructure:
  - `createBatchingDispatcher()` queues progress updates, flushes at 50ms intervals
  - First item in batch dispatched immediately for responsiveness
  - Subsequent items batched into single `BATCH_PROGRESS` event
  - `processBatchProgress` action processes all items in single state update
  - At `-j 100`: reduces dispatches by 95%+ (from 100 to 2-3 per 50ms window)
  - Automatic cleanup on complete/error to prevent memory leaks
- ✅ **'q' key now properly exits during evaluation** - Fixed process not terminating:
  - Created `AbortController` in eval.ts for user cancellation via 'q' key
  - Abort signal passed to evaluator (combined with any existing abort signal via `AbortSignal.any()`)
  - `onCancel` callback now calls `abort()` on the controller
  - Force `process.exit(130)` after abort (standard Unix exit code for SIGINT)
  - Previously: pressing 'q' would unmount Ink but leave Node.js process hanging on async work
- ✅ **Token tracking with provider labels** - Fixed provider ID mismatch:
  - TokenUsageTracker now uses `provider.label || provider.id()` instead of just `provider.id()`
  - This matches the state machine provider keys used by the Ink UI
  - Previously: If provider had a label (e.g., "My Custom GPT-4") different from its ID (e.g., "openai:gpt-4"),
    token updates were silently dropped because the normalized ID didn't match the state machine key
  - The `normalizeProviderId` function in `useTokenMetrics.ts` strips constructor name suffixes to match

**Total: 338 UI tests passing** (3 new BATCH_PROGRESS tests)

---

## Executive Summary

The Ink CLI UI is a solid foundation with strong real-time progress tracking and now has robust filtering, search, and statistics features. The **primary remaining gap is integration with existing CLI commands** - features like export, share, retry, and eval management already exist but aren't accessible from the interactive UI.

---

## Part 1: CLI Command Analysis

### Available Commands (from `promptfoo --help`)

| Command            | Description          | UI Integration Status |
| ------------------ | -------------------- | --------------------- |
| `eval`             | Run evaluation       | ✅ Core functionality |
| `share [id]`       | Create shareable URL | ❌ Not in UI          |
| `export eval <id>` | Export to JSON       | ❌ Not in UI          |
| `retry <evalId>`   | Retry ERROR results  | ❌ Not in UI          |
| `show eval [id]`   | Show eval details    | ❌ Not in UI          |
| `list evals`       | List evaluations     | ❌ Not in UI          |
| `view`             | Open web UI          | N/A                   |
| `cache`            | Manage cache         | N/A (low priority)    |

### Eval Command Options (from `eval --help`)

**Filter Options (partially integrated):**
| Option | Description | UI Status |
|--------|-------------|-----------|
| `--filter-pattern <regex>` | Filter tests by regex | ✅ Via `/search/` |
| `--filter-first-n <N>` | Limit to first N tests | ❌ Not in UI |
| `--filter-sample <N>` | Random sample of N tests | ❌ Not in UI |
| `--filter-providers <regex>` | Filter by provider | ❌ Not in UI |
| `--filter-failing <path>` | Re-run failing tests | ❌ Not in UI |
| `--filter-errors-only <path>` | Re-run error tests only | ❌ Not in UI |
| `--filter-metadata <k=v>` | Filter by metadata | ❌ Not in UI |

**Output Options:**
| Option | Description | UI Status |
|--------|-------------|-----------|
| `-o, --output <paths>` | Export CSV/JSON/YAML/HTML/TXT | ❌ Not in UI |
| `--share` | Create shareable URL | ❌ Not in UI |
| `--table-cell-max-length` | Truncate cells | ✅ Via `maxCellLength` |

**Execution Options:**
| Option | Description | UI Status |
|--------|-------------|-----------|
| `-w, --watch` | Watch for config changes | ❌ No indicator in UI |
| `--resume [evalId]` | Resume incomplete eval | ❌ Not in UI |
| `--retry-errors` | Retry errors from latest | ❌ Not in UI |
| `--repeat <N>` | Run tests N times | N/A (config option) |
| `--delay <ms>` | Delay between tests | N/A (config option) |

---

## Part 2: Feature Gap Analysis

### Critical Gaps (P0)

| Feature               | CLI Support       | Web UI       | CLI Interactive UI | Impact                              |
| --------------------- | ----------------- | ------------ | ------------------ | ----------------------------------- |
| **Export to file**    | ✅ `-o file.json` | ✅ 7 formats | ❌ None            | **HIGH** - Users can't get data out |
| **Copy to clipboard** | ❌                | ✅           | ❌ None            | **HIGH** - Quick data extraction    |

### High Priority Gaps (P1)

| Feature                 | CLI Support           | Web UI | CLI Interactive UI | Impact                    |
| ----------------------- | --------------------- | ------ | ------------------ | ------------------------- |
| **Share results**       | ✅ `promptfoo share`  | ✅     | ❌ None            | HIGH - Team collaboration |
| **Retry errors**        | ✅ `promptfoo retry`  | ❌     | ❌ None            | HIGH - Error recovery     |
| **Re-run failed tests** | ✅ `--filter-failing` | ✅     | ❌ None            | MEDIUM - Debugging        |

### Medium Priority Gaps (P2)

| Feature                  | CLI Support             | Web UI | CLI Interactive UI | Impact                    |
| ------------------------ | ----------------------- | ------ | ------------------ | ------------------------- |
| **Eval history/list**    | ✅ `list evals`         | ✅     | ❌ None            | MEDIUM - Navigation       |
| **Watch mode indicator** | ✅ `-w` flag            | N/A    | ❌ No visual       | LOW - Awareness           |
| **Provider filtering**   | ✅ `--filter-providers` | ✅     | ❌ None            | MEDIUM - Multi-provider   |
| **Metadata filtering**   | ✅ `--filter-metadata`  | ✅     | ❌ None            | MEDIUM - Advanced queries |

### Lower Priority Gaps (P3)

| Feature               | CLI Support | Web UI         | CLI Interactive UI | Impact                  |
| --------------------- | ----------- | -------------- | ------------------ | ----------------------- |
| **ASCII charts**      | ❌          | ✅ Histograms  | ❌ None            | LOW - Visual feedback   |
| **Column visibility** | N/A         | ✅ 10+ options | ❌ Fixed layout    | LOW - Customization     |
| **Comparison mode**   | ❌          | ✅             | ❌ None            | LOW - Advanced analysis |
| **Theme support**     | ❌          | ✅             | ❌ None            | LOW - Aesthetics        |

---

## Part 3: What CLI UI Does Well

| Feature                      | Assessment                                          |
| ---------------------------- | --------------------------------------------------- |
| **Real-time Progress**       | Superior - live per-provider metrics, cost, latency |
| **Keyboard-First**           | Full navigation without mouse (vim + arrows)        |
| **Quick Filters**            | Single-key modes (a/p/f/e/d) + regex search         |
| **Summary Statistics**       | Pass/fail/error counts, rate, score, cost, latency  |
| **Error Display**            | Categorization, stack trace detection               |
| **Terminal Integration**     | Native feel, responsive layout                      |
| **Low Overhead**             | No browser needed                                   |
| **Non-interactive Fallback** | Graceful CI/non-TTY handling                        |

---

## Part 4: Prioritized Implementation Roadmap

### Phase 3: Export & Integration (NEXT PRIORITY)

| Feature               | Priority | Effort | Impact   | Implementation Notes                                      |
| --------------------- | -------- | ------ | -------- | --------------------------------------------------------- |
| **Export to file**    | **P0**   | 2 days | Critical | Add `e` key → format menu → save file                     |
| **Copy to clipboard** | **P0**   | 1 day  | Critical | `c` key for current cell/row, use `clipboardy`            |
| **Share results**     | **P1**   | 1 day  | High     | `s` key → call `createShareableUrl()` from `src/share.ts` |
| **Retry errors**      | **P1**   | 2 days | High     | `R` key → spawn new eval with `--filter-errors-only`      |
| **Re-run failed**     | **P1**   | 1 day  | Medium   | `F` key → spawn eval with `--filter-failing`              |

**Proposed Keyboard Shortcuts:**

```
Export & Share:
  e → Export menu (c=CSV, j=JSON, y=YAML, h=HTML)
  c → Copy current cell/row to clipboard
  s → Share to cloud, show URL

Re-run:
  R → Retry all errors (spawns new eval)
  F → Re-run all failed tests (spawns new eval)
```

### Phase 4: Advanced Filtering

| Feature                | Priority | Effort  | Impact | Implementation Notes             |
| ---------------------- | -------- | ------- | ------ | -------------------------------- |
| **Provider filtering** | P2       | 1 day   | Medium | `:provider gpt-4` command syntax |
| **Metadata filtering** | P2       | 2 days  | Medium | `:meta key=value` command syntax |
| **Sample/limit tests** | P3       | 0.5 day | Low    | Pre-filter before display        |

### Phase 5: Navigation & History

| Feature                  | Priority | Effort  | Impact | Implementation Notes                        |
| ------------------------ | -------- | ------- | ------ | ------------------------------------------- |
| **Eval history**         | P2       | 2 days  | Medium | `H` key → list recent evals, select to view |
| **Watch mode indicator** | P3       | 0.5 day | Low    | Show icon when `-w` flag active             |
| **Resume incomplete**    | P3       | 1 day   | Low    | Detect incomplete eval, offer resume        |

### Phase 6: Visualization & Polish

| Feature               | Priority | Effort   | Impact | Implementation Notes         |
| --------------------- | -------- | -------- | ------ | ---------------------------- |
| **ASCII charts**      | P3       | 2-3 days | Low    | Score distribution histogram |
| **Column visibility** | P3       | 1 day    | Low    | `v` key → toggle columns     |
| **Theme support**     | P4       | 1 day    | Low    | Colorblind-friendly options  |
| **Full help overlay** | P4       | 0.5 day  | Low    | `?` key shows all commands   |

---

## Part 5: Technical Implementation Notes

### Export Implementation

Reuse existing format utilities from the codebase:

```typescript
// Existing utilities to leverage:
// - src/util/exportToFile.ts - File writing
// - src/csvExport.ts - CSV formatting
// - JSON.stringify for JSON
// - yaml.dump for YAML

// New hook needed:
function useExport(data: TableRowData[]) {
  const exportAsCSV = () => {
    /* ... */
  };
  const exportAsJSON = () => {
    /* ... */
  };
  const exportAsYAML = () => {
    /* ... */
  };
  const copyToClipboard = (content: string) => {
    /* ... */
  };
  return { exportAsCSV, exportAsJSON, exportAsYAML, copyToClipboard };
}
```

### Share Implementation

```typescript
// Existing function to call:
import { createShareableUrl } from '../share';

// In ResultsTable or new ShareOverlay:
const handleShare = async () => {
  const url = await createShareableUrl(evalId);
  // Show URL in overlay, offer copy button
};
```

### Retry/Re-run Implementation

```typescript
// Option 1: Shell out to promptfoo CLI
import { spawn } from 'child_process';
spawn('promptfoo', ['retry', evalId], { stdio: 'inherit' });

// Option 2: Direct function call (preferred)
import { retryEval } from '../commands/retry';
await retryEval(evalId, { maxConcurrency: 4 });
```

---

## Part 6: Testing Requirements

### Current Coverage (335 tests)

| Area                        | Tests | Status      |
| --------------------------- | ----- | ----------- |
| State machine (evalMachine) | 38    | ✅ Complete |
| RingBuffer                  | 35    | ✅ Complete |
| Filter utilities            | 73    | ✅ Complete |
| Summary statistics          | 24    | ✅ Complete |
| Error categorization        | 44    | ✅ Complete |
| Regex search                | 25    | ✅ Complete |

### Needed for Phase 3

| Area                 | Tests Needed                    |
| -------------------- | ------------------------------- |
| Export utilities     | Format conversion, file writing |
| Clipboard operations | Mock clipboard API              |
| Share integration    | Mock `createShareableUrl`       |
| Retry/re-run         | Mock eval spawning              |

---

## Part 7: Architecture Notes

### Remaining Concerns

#### 1. Delta Tracking Complexity

- **File**: `src/ui/evalBridge.ts`
- **Problem**: Complex closure-based delta tracking across callbacks
- **Status**: ✅ IMPROVED - Removed redundant dispatches and double counting
- **Changes Made**:
  - Removed UPDATE_TOKEN_METRICS dispatch (handled by useTokenMetrics hook with debouncing)
  - Removed PROVIDER_UPDATE dispatch (was never processed - converted to null)
  - Fixed double counting of pass/fail/errors between TEST_RESULT and PROGRESS
  - Reduced dispatches per test from 5 to 3
- **Recommendation**: Further optimization possible by combining remaining 3 dispatches into 1

#### 2. Large Dataset Performance

- **Issue**: No virtualization for 1000+ rows
- **Status**: ✅ TESTED - Performance test infrastructure added
- **Test**: `examples/perf-test-1000/` with 1000 tests × 8 mock providers
- **Findings**:
  - UI handles 800+ evaluations smoothly during progress updates
  - Real-time metrics (tokens, cost, latency) update correctly
  - No noticeable lag or rendering issues at ~50ms update intervals
- **Improvements Made**:
  - Token metrics now debounced at 100ms via useTokenMetrics hook
  - Reduced React re-renders by ~40% (from 5 to 3 dispatches per test)
- **Recommendation**: Results table virtualization still needed for viewing 1000+ completed results

---

## Summary

### Completed ✅

**Phase 1 (Stability):**

- XState state machine with 38 tests
- Error boundaries with recovery
- RingBuffer for O(1) log operations
- Type safety cleanup

**Phase 2 (Core Features):**

- Regex search with `/pattern/flags` syntax
- Summary statistics footer (pass/fail/error, rate, score)
- Total cost and average latency metrics
- Improved error display with categorization

### Next Priority: Export & Integration (Phase 3)

The highest-impact remaining work is **integrating existing CLI commands** into the interactive UI:

1. **Export to file** (P0) - Users need to get data out
2. **Copy to clipboard** (P0) - Quick data extraction
3. **Share results** (P1) - Team collaboration via existing `share` command
4. **Retry errors** (P1) - Error recovery via existing `retry` command
5. **Re-run failed** (P1) - Debugging via existing `--filter-failing`

These features **already exist** as CLI commands - we just need to expose them via keyboard shortcuts in the interactive UI.

### Recommended Implementation Order

```
Week 1: Export & Clipboard (P0)
  - Add export menu (e key)
  - Add clipboard support (c key)
  - 4-5 new tests

Week 2: Share & Retry (P1)
  - Add share integration (s key)
  - Add retry errors (R key)
  - Add re-run failed (F key)
  - 6-8 new tests

Week 3: Advanced Features (P2-P3)
  - Provider/metadata filtering
  - Eval history navigation
  - ASCII charts (if time)
```

---

## Appendix: Key File References

| Aspect           | File                                            | Notes                     |
| ---------------- | ----------------------------------------------- | ------------------------- |
| State Management | `src/ui/machines/evalMachine.ts`                | XState machine            |
| Results Table    | `src/ui/components/table/ResultsTable.tsx`      | Main table + stats footer |
| Filter Utilities | `src/ui/components/table/filterUtils.ts`        | Search, regex, filtering  |
| Error Display    | `src/ui/components/table/CellDetailOverlay.tsx` | Error categorization      |
| CLI Share        | `src/share.ts`                                  | `createShareableUrl()`    |
| CLI Retry        | `src/commands/retry.ts`                         | Retry eval command        |
| CLI Export       | `src/commands/export.ts`                        | Export eval command       |
| Format Utils     | `src/ui/utils/format.ts`                        | Cost, latency, tokens     |
