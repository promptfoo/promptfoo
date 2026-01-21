# SIGINT Handler Investigation and Graceful Shutdown Plan

## Executive Summary

The SIGINT handler in `src/commands/eval.ts` (lines 459-513) was disabled in PR #5620 (September 15, 2025) due to "database corruption issues" and "orphaned database locks." This document investigates the root causes and proposes a safe solution for re-enabling graceful interruption.

## Timeline of Events

| Date         | Event                                            | Commit              |
| ------------ | ------------------------------------------------ | ------------------- |
| Sep 13, 2025 | Original pause/resume feature added              | `c744902be` (#5570) |
| Sep 15, 2025 | Feature reverted                                 | `f0ad6716f`         |
| Sep 15, 2025 | SIGINT handler commented out                     | `98181fc55` (#5620) |
| Later        | Resume flag re-enabled (without SIGINT handling) | `aaa560208`         |

## Root Cause Analysis

### The Disabled Code

```typescript
// From src/commands/eval.ts lines 459-513 (currently commented out)
const abortController = new AbortController();
// ... setup abort signal ...

sigintHandler = () => {
  if (paused) {
    // Second Ctrl+C: force exit
    process.exit(130); // <-- CRITICAL: Hard exit without cleanup
  }
  paused = true;
  abortController.abort(); // <-- Triggers abort
};
process.once('SIGINT', sigintHandler);
```

### Why Database Corruption Occurred

#### The Real Root Cause: Multiple `process.exit()` Calls Bypass Cleanup

The fundamental issue: **SIGINT handlers call `process.exit(130)` which bypasses `shutdownGracefully()` in `main.ts`**.

This isn't limited to `eval.ts` - other code registers its own SIGINT handlers:

| Location                                     | Behavior                                   |
| -------------------------------------------- | ------------------------------------------ |
| `src/commands/eval.ts:475`                   | Calls `process.exit(130)` on second Ctrl+C |
| `src/providers/openai/chatkit-pool.ts:92-94` | Calls `process.exit(130)` on FIRST Ctrl+C  |
| `src/onboarding.ts:681`                      | Calls `process.exit(130)`                  |
| `src/redteam/commands/init.ts:718`           | Calls `process.exit(130)`                  |

The proper cleanup path exists but is bypassed:

```typescript
// src/main.ts:248-274
const shutdownGracefully = async () => {
  await telemetry.shutdown();
  await closeLogger();
  closeDbIfOpen(); // <-- WAL checkpoint happens here
  // ...
};
```

#### Key Technical Facts

1. **better-sqlite3 is synchronous** - The database layer uses `better-sqlite3` (sync), not async SQLite. Result inserts are already awaited in the eval loop. There are no "pending async writes" to track.

2. **Abort is checked only at eval-step boundaries** - The evaluator checks `abortSignal.aborted` before starting each eval step (`src/evaluator.ts:1677`), but in-flight steps continue through `addResult()`/`addPrompts()`.

3. **evaluate() does NOT return early on abort** - After catching abort error at line 1698, the evaluator continues to:
   - Run comparisons (lines 1700+)
   - Set vars (line 2001)
   - Run afterAll extensions (line 2014)
   - Calculate telemetry (line 2023+)

4. **Multiple write locations** - Not just results, but: prompt updates, result updates during comparisons, final eval save, signal file updates.

5. **`process.once` breaks second Ctrl+C** - The handler is removed after first signal.

6. **Watch mode poisoning** - Mutated `evaluateOptions.abortSignal` could affect subsequent runs.

## Design Decisions (FINAL)

### D1: ChatKit Coordination → Remove Its SIGINT Handler

ChatKit registers its own SIGINT handler that calls `process.exit(130)` on first Ctrl+C, bypassing all cleanup. **Decision: Remove it.**

```typescript
// src/providers/openai/chatkit-pool.ts:92-94 - TO BE REMOVED
process.on('SIGINT', () => {
  cleanup();
  process.exit(130); // <-- Bypasses everything
});
```

ChatKit cleanup already happens via:

- `process.on('exit', cleanup)` at line 91 (already registered)
- `providerRegistry.shutdownAll()` called in normal exit path

### D2: Persist Already-Computed Rows → Yes

When abort is signaled, **in-flight eval steps complete and persist their results**.

The evaluator structure:

```
async.forEachOfLimit(evalSteps) {
  checkAbort();  // <-- Abort check HERE (before starting work)
  await processEvalStepWithTimeout();  // API call happens here
  await processEvalStep();  // Persists result - NO abort check here
}
```

- `checkAbort()` at line 1677 prevents **starting** new eval steps
- Once a step starts, let it complete and persist (sync write, fast)
- This gives resume the most data to work with

**No additional abort checks needed inside `processEvalStep`.**

### D3: Skip afterAll Hooks on Abort → Yes

AfterAll hooks assume all results exist. Skipping is safer. Extensions needing cleanup should use `process.on('exit')`.

## Proposed Solution

### Core Principles

1. **No `process.exit()` on first Ctrl+C** - Let `evaluate()` return, flow to `shutdownGracefully()`
2. **Persist completed work** - Don't drop rows that are already computed
3. **Skip post-eval work on abort** - No comparisons, no afterAll, no telemetry
4. **Handler cleanup in try/finally** - Never leak handlers even if evaluate() throws
5. **Force exit as escape hatch** - Second Ctrl+C or timeout for hung shutdowns

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     First Ctrl+C                                 │
│                                                                   │
│  1. SIGINT handler: set "paused" flag, abortController.abort()  │
│  2. checkAbort() at line 1677 throws for NEXT eval step         │
│  3. In-flight eval steps complete and persist (D2)              │
│  4. Catch block: early return, skip comparisons/afterAll        │
│  5. doEval() prints resume instructions                          │
│  6. Normal exit → shutdownGracefully() → closeDbIfOpen()        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     Second Ctrl+C (or 10s timeout)               │
│                                                                   │
│  1. Try closeDbIfOpen() for WAL checkpoint (best-effort)        │
│  2. process.exit(130)                                            │
│  ⚠️  UNSAFE - may leave WAL inconsistent, but user asked for it │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation Plan

#### Change 1: Remove ChatKit SIGINT Handler

**File: `src/providers/openai/chatkit-pool.ts`**

```diff
-    process.on('SIGINT', () => {
-      cleanup();
-      process.exit(130);
-    });
-    process.on('SIGTERM', () => {
-      cleanup();
-      process.exit(143);
-    });
+    // Cleanup is handled by providerRegistry.shutdownAll() in normal exit path
+    // Don't register SIGINT handler here - let eval.ts handle graceful shutdown
```

ChatKit cleanup already happens via `process.on('exit', cleanup)` at line 91.

#### Change 2: SIGINT Handler in eval.ts - No process.exit on First Signal

**File: `src/commands/eval.ts`**

```typescript
// Re-enable SIGINT handling with correct approach
const abortController = new AbortController();
const previousAbortSignal = evaluateOptions.abortSignal;
evaluateOptions.abortSignal = previousAbortSignal
  ? AbortSignal.any([previousAbortSignal, abortController.signal])
  : abortController.signal;

let paused = false;
let sigintHandler: NodeJS.SignalsListener | undefined;
let forceExitTimeout: NodeJS.Timeout | undefined;

const cleanupHandler = () => {
  if (sigintHandler) {
    process.removeListener('SIGINT', sigintHandler);
    sigintHandler = undefined;
  }
  if (forceExitTimeout) {
    clearTimeout(forceExitTimeout);
    forceExitTimeout = undefined;
  }
  // Restore original abort signal for watch mode
  evaluateOptions.abortSignal = previousAbortSignal;
};

if (cmdObj.write !== false) {
  sigintHandler = () => {
    if (paused) {
      // Second Ctrl+C: force exit (UNSAFE - WAL may be inconsistent)
      logger.warn('Force exiting - database may need recovery on next run...');
      try {
        closeDbIfOpen();  // Best-effort WAL checkpoint
      } catch {
        // Ignore - we're force exiting anyway
      }
      process.exit(130);
    }
    paused = true;
    logger.info(
      chalk.yellow('Pausing evaluation... Press Ctrl+C again to force exit.'),
    );
    abortController.abort();

    // Set a timeout for force exit if graceful shutdown hangs
    forceExitTimeout = setTimeout(() => {
      logger.warn('Graceful shutdown timed out, force exiting...');
      try {
        closeDbIfOpen();
      } catch {
        // Ignore
      }
      process.exit(130);
    }, 10000).unref();
  };

  // Use process.on instead of process.once to handle second Ctrl+C
  process.on('SIGINT', sigintHandler);
}

let ret: EvaluateSummary;
try {
  ret = await evaluate(testSuite, evalRecord, { ... });
} finally {
  cleanupHandler();  // Always cleanup, even if evaluate() throws
}
```

#### Change 3: Early Exit in Evaluator on Abort

**File: `src/evaluator.ts`**

After the main eval loop catch block (around line 1698), add early exit:

```typescript
} catch (err) {
  if (options.abortSignal?.aborted) {
    evalTimedOut = evalTimedOut || maxEvalTimeMs > 0;
    if (evalTimedOut) {
      logger.warn(`Evaluation stopped after reaching max duration (${maxEvalTimeMs}ms)`);
    } else {
      logger.info('Evaluation interrupted, saving progress...');
    }
    // EARLY EXIT: Skip comparisons, afterAll, telemetry
    // Results already persisted by addResult() calls
    return this.getSummary(prompts, testSuite);
  } else {
    if (ciProgressReporter) {
      ciProgressReporter.error(`Evaluation failed: ${String(err)}`);
    }
    throw err;
  }
}

// Comparisons, afterAll, telemetry continue here (only if NOT aborted)
```

#### Change 4: Cleanup After evaluate() Returns

**File: `src/commands/eval.ts`**

```typescript
// After evaluate() returns (this is now in finally block or after try)
cliState.resume = false;

// If paused, print minimal guidance and return
if (paused && cmdObj.write !== false) {
  printBorder();
  logger.info(`${chalk.yellow('⏸')} Evaluation paused. ID: ${chalk.cyan(evalRecord.id)}`);
  logger.info(`» Resume with: ${chalk.green.bold('promptfoo eval --resume ' + evalRecord.id)}`);
  printBorder();
  return ret; // Let normal exit path handle cleanup via shutdownGracefully()
}
```

### What This Approach Fixes

| Issue                             | How It's Fixed                                   |
| --------------------------------- | ------------------------------------------------ |
| `process.exit()` bypasses cleanup | First Ctrl+C doesn't call `process.exit()`       |
| ChatKit handler bypasses cleanup  | Remove ChatKit's SIGINT handler (D1)             |
| evaluate() doesn't return early   | Add explicit early return after catch (Change 3) |
| In-flight rows lost               | Let in-flight steps complete and persist (D2)    |
| Comparisons left incomplete       | Skip comparisons on abort; resume completes them |
| Second Ctrl+C doesn't work        | Use `process.on` instead of `process.once`       |
| Watch mode signal poisoning       | Restore original signal in finally block         |
| Handler leak on throw             | try/finally ensures cleanup                      |
| Force exit unsafe                 | Best-effort `closeDbIfOpen()` before exit        |

### Abort Policy (MUST DOCUMENT)

When an evaluation is aborted via SIGINT:

1. **What is persisted:**
   - All results from eval steps that completed before abort check
   - Prompt metrics for those completed steps
   - The eval record itself (ID, config, prompts)

2. **What is skipped:**
   - In-progress eval steps (after abort check fires)
   - All comparisons (select-best, max-score assertions)
   - afterAll extension hooks
   - Telemetry reporting

3. **Implications for resume:**
   - Resuming is **required** to get comparison grading
   - Rows without comparison grading have incomplete scores
   - Resume will re-run only the incomplete eval steps, then run all comparisons

4. **Documentation location:**
   - Add to `site/docs/usage/command-line.md` under `--resume` section
   - Add warning in CLI output when pausing

### Testing Plan

1. **Unit Tests**
   - Verify cleanup called even when evaluate() throws
   - Verify abort signal restored for watch mode
   - Verify abort check at top of processEvalStep prevents partial metrics

2. **Integration Tests**
   - Start eval, send SIGINT mid-evaluation
   - Verify `shutdownGracefully()` runs (check WAL checkpoint log)
   - Verify resume works correctly
   - Test double Ctrl+C force exit
   - Test in watch mode: abort one run, verify next run works

3. **ChatKit-Specific Tests** (critical path)
   - Eval with ChatKit provider, send SIGINT
   - Verify no competing SIGINT handlers (ChatKit's removed)
   - Verify browser cleanup happens via `process.on('exit')`
   - Verify database is not corrupted

4. **Comparison Phase Tests** (critical path)
   - Eval with select-best assertions
   - Abort DURING comparison phase (if possible to time)
   - Verify comparison sets are consistent with persisted rows
   - Resume and verify comparisons complete correctly

5. **Manual Testing Scenarios**
   - Large eval (100+ tests), SIGINT at various points
   - High concurrency eval, SIGINT during parallel work
   - Resume after SIGINT
   - Watch mode: Ctrl+C, then re-run
   - ChatKit provider eval with SIGINT

### Success Criteria

1. ✅ Ctrl+C pauses evaluation without database corruption
2. ✅ `shutdownGracefully()` runs (WAL checkpoint)
3. ✅ Resume works reliably after pause
4. ✅ Double Ctrl+C provides force exit escape hatch (with best-effort DB close)
5. ✅ Watch mode works correctly after abort
6. ✅ ChatKit evals can be interrupted safely
7. ✅ Minimal code changes, no new infrastructure

### Risks and Mitigations

| Risk                                     | Likelihood | Impact | Mitigation                                              |
| ---------------------------------------- | ---------- | ------ | ------------------------------------------------------- |
| ChatKit needs SIGINT for browser cleanup | Low        | Medium | Browser cleanup via `process.on('exit')` should suffice |
| Extensions expect afterAll on abort      | Medium     | Low    | Document behavior; extensions use `process.on('exit')`  |
| Resume data incomplete                   | Low        | Medium | All computed rows are persisted before abort            |
| Watch mode breaks                        | Low        | High   | Signal restore in finally block                         |

## Appendix: Related Code Locations

| File                                   | Lines     | Purpose                                           |
| -------------------------------------- | --------- | ------------------------------------------------- |
| `src/commands/eval.ts`                 | 459-513   | Disabled SIGINT handler                           |
| `src/providers/openai/chatkit-pool.ts` | 91-99     | ChatKit SIGINT handler (to remove)                |
| `src/evaluator.ts`                     | 1676-1698 | Main eval loop with abort catch                   |
| `src/evaluator.ts`                     | 1700-2050 | Post-eval work (comparisons, afterAll, telemetry) |
| `src/models/eval.ts`                   | 572-584   | `addResult()` method                              |
| `src/database/index.ts`                | 79-103    | `closeDb()` with WAL checkpoint                   |
| `src/main.ts`                          | 248-274   | `shutdownGracefully()`                            |

## References

- PR #5620: https://github.com/promptfoo/promptfoo/pull/5620
- PR #5570: https://github.com/promptfoo/promptfoo/pull/5570
- SQLite WAL Mode: https://www.sqlite.org/wal.html

---

## Revision History

| Date    | Change                                                                                                                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Initial | Proposed write tracking infrastructure                                                                                                                                                                 |
| Rev 1   | Simplified - better-sqlite3 is sync, root cause is `process.exit()` bypassing cleanup                                                                                                                  |
| Rev 2   | Addressed gaps: ChatKit handler, evaluate() early exit, try/finally cleanup, force-exit best-effort DB close, open design questions                                                                    |
| Rev 3   | Added Abort Policy section, ChatKit-specific and comparison-phase test coverage                                                                                                                        |
| Rev 4   | **Decisions finalized**: D1 (remove ChatKit SIGINT), D2 (persist in-flight rows - no abort check in processEvalStep), D3 (skip afterAll). Removed Change 3b since existing checkAbort() is sufficient. |

## Implementation Checklist

- [ ] **Change 1**: Remove SIGINT/SIGTERM handlers from `chatkit-pool.ts`
- [ ] **Change 2**: New SIGINT handler in `eval.ts` with try/finally cleanup
- [ ] **Change 3**: Early return in evaluator after abort catch (skip comparisons/afterAll)
- [ ] **Change 4**: Resume instructions after paused eval
- [ ] **Docs**: Update `site/docs/usage/command-line.md` with abort policy
- [ ] **Tests**: ChatKit SIGINT tests
- [ ] **Tests**: Comparison phase abort tests
