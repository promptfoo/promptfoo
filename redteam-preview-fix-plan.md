# Redteam Preview Prompt Fix Plan

## Problem Statement

- Running a redteam preview/eval when the prompt template is just `{{prompt}}` and the preview step has not yet injected an attack produces `Error: Invariant failed: Grader promptfoo:redteam:… must have a prompt` coming from `src/assertions/redteam.ts:41-44`.
- We reproduced this by running `npm run local -- eval -c repro-eval.yaml` (config uses `prompts: ['{{prompt}}']` and an empty `vars` block) which matches the reporter's UI workflow, so the bug is confirmed.
- Preview runs exist to validate target connectivity, not to grade attack quality, so we need to avoid crashing when no prompt exists yet.

## Goals

1. Frontend preview/test flows should never schedule a redteam assertion until an attack string exists (either by generating a plugin case or by injecting a placeholder).
2. Backend grading should degrade gracefully if a test accidentally reaches `handleRedteam` without a usable prompt, surfacing a helpful validation error rather than throwing.
3. Add regression coverage so future refactors cannot reintroduce the invariant failure.

## Proposed Changes

1. **Frontend quick-test guard**
   - In the redteam setup UI (components under `src/app/src/pages/redteam/setup`), detect when the current prompts are only templates (e.g., match the regex `/\{\{.*\}\}/` and `config.strategies/plugins` have not produced vars yet).
   - When the user requests a target preview, either:
     - Call `/providers/test` with a static placeholder prompt (e.g., `'Preview probe for target validation'`), or
     - Temporarily skip attaching `assert` entries so we only test transport until plugin generation occurs.
   - Surface UI messaging that previews do not run assertions until a real attack is generated.

2. **Backend safety net**
   - Update `handleRedteam` in `src/assertions/redteam.ts` so that if `prompt` is missing/blank we return a failed grading result with a clear reason (`'No prompt available for grader …; ensure attack generation ran before testing'`) instead of throwing.
   - Preserve existing behaviour when a `storedGraderResult` is available and when `prompt` contains actual content.

3. **Regression tests**
   - Add a unit test for `handleRedteam` verifying the new graceful-path when `prompt` is empty.
   - Add a frontend test covering the preview button workflow to confirm we no longer enqueue assertions without a real prompt.
   - Optional: add an integration test that loads a config similar to `repro-eval.yaml` and asserts the CLI exits cleanly with a descriptive validation warning instead of an uncaught exception.

## Implementation Status

**Completed on branch: `fix/redteam-preview-missing-prompt`**

### Commits

1. `fix(assertions): handle missing prompt gracefully in redteam grader`
   - Modified `src/assertions/redteam.ts` to return a failing grade instead of throwing an invariant error
   - Added helpful error message explaining the issue

2. `test(assertions): add tests for missing prompt handling in redteam grader`
   - Added 3 unit tests covering undefined, empty, and whitespace-only prompts
   - All tests verify the helpful error message is included

3. `fix(assertions): preserve metadata when returning early for missing prompt`
   - Ensure test.metadata (pluginId, strategyId, severity) is included in the grading result
   - Add test to verify metadata preservation

### Files Modified

- `src/assertions/redteam.ts` - Backend safety net implementation with metadata preservation
- `test/assertions/redteam.test.ts` - Unit tests for the fix (5 tests total)

## Root Cause Analysis (Updated)

After thorough code analysis, the issue is better understood:

### What Does NOT Cause This Error

**The "Test Target" button in the UI does NOT cause this issue:**

- Located in `src/app/src/pages/redteam/setup/components/Targets/HttpEndpointConfiguration.tsx`
- Calls `/providers/test` endpoint
- Server handler in `src/server/routes/providers.ts` (lines 41-80)
- Uses `testHTTPProviderConnectivity` which creates a TestSuite with **NO assertions**
- This flow works correctly and is not the source of Issue #5995

### What DOES Cause This Error

**Running a full redteam evaluation with misconfigured prompts:**

1. User creates config with `prompts: ['{{prompt}}']` and redteam assertions
2. User runs evaluation via:
   - CLI: `promptfoo eval -c config.yaml`
   - UI: "Run Now" button in Review.tsx (calls `/redteam/run`)
3. The `{{prompt}}` template variable is never filled in because:
   - No test case generation occurred, OR
   - The `vars` don't contain a value for `prompt`
4. Evaluation runs with empty/undefined prompt
5. Redteam grader fails because it needs actual prompt content for grading

**Code flow:**

- Review.tsx `handleRunWithSettings` (line 376) → `/redteam/run`
- Server: `src/server/routes/redteam.ts` (lines 150-231)
- Calls `doRedteamRun` in `src/redteam/shared.ts`
- Eventually reaches `handleRedteam` in `src/assertions/redteam.ts`

### Key Files Summary

| Component        | File                            | Lines   | Purpose                                |
| ---------------- | ------------------------------- | ------- | -------------------------------------- |
| Test Target (OK) | `HttpEndpointConfiguration.tsx` | 151-244 | Uses `/providers/test` - NO assertions |
| Run Now (ERROR)  | `Review.tsx`                    | 312-440 | Calls `/redteam/run` with full eval    |
| Backend Handler  | `src/server/routes/redteam.ts`  | 150-231 | Handles `/redteam/run`                 |
| Redteam Logic    | `src/redteam/shared.ts`         | 18-135  | Generates tests + runs eval            |
| Error Location   | `src/assertions/redteam.ts`     | 46-57   | Now handles missing prompt gracefully  |

## What This Fix Does

- **Prevents crash**: The invariant error no longer crashes the evaluation
- **Provides helpful message**: Users see a clear explanation of what went wrong
- **Preserves metadata**: Plugin/strategy info is retained for reporting and UI filtering

## Assessment

**This fix is appropriate and complete for the reported issue.**

The user in Issue #5995 was running `promptfoo redteam run` (or clicking "Run Now") with a config that had:

- Template prompts: `prompts: ['{{prompt}}']`
- Redteam plugins that generate assertions
- But test generation failed (due to API key issues or similar)

When test generation fails, no actual prompts are created, so the assertions run with empty prompts and crash. The backend safety net we implemented correctly handles this case by:

1. Returning a failing grade instead of crashing
2. Providing a helpful error message
3. Preserving metadata for UI display

### No Frontend Changes Needed

The "Test Target" button already works correctly because it:

- Uses a separate endpoint (`/providers/test`)
- Does not attach any assertions
- Only tests HTTP connectivity

The issue is with running full evaluations before test cases are properly generated - which is now handled gracefully by the backend fix.

### Potential Future Enhancement

If desired, validation could be added in `src/redteam/shared.ts` to:

- Check if test generation succeeded before running eval
- Provide early warning if prompts are still templates
- Skip eval entirely if no valid test cases were generated

But this is not required to fix Issue #5995 - the current backend safety net is sufficient.

## Demo Path

### Verify the Fix

1. **Run the reproduction config:**

   ```bash
   npm run local -- eval -c repro-eval.yaml
   ```

2. **Expected result (BEFORE fix):**

   ```
   Error: Invariant failed: Grader promptfoo:redteam:harmful:misinformation-disinformation must have a prompt
   ```

3. **Expected result (AFTER fix):**

   ```
   ┌────────────────────────────────────────────────────────────────────┐
   │ [file:///...plugin_bug.py] {{prompt}}                              │
   ├────────────────────────────────────────────────────────────────────┤
   │ [FAIL] I don't want to talk to you.                               │
   └────────────────────────────────────────────────────────────────────┘

   Pass Rate: 0.00%
   ```

   The evaluation completes with a failing grade instead of crashing.

### Run Unit Tests

```bash
npm test -- test/assertions/redteam.test.ts --coverage
```

Expected: All 4 tests pass, including:

- `returns a failing grade when prompt is undefined`
- `returns a failing grade when prompt is empty string`
- `returns a failing grade when prompt is whitespace only`

### UI Testing

1. Open the redteam setup UI
2. Configure a target with harmful plugins
3. Attempt to run a preview/test before generating attack cases
4. Verify: The evaluation should show a failing grade with a clear message instead of crashing

## Rollout & Validation

1. Manual QA:
   - Re-run the reproduction config (`repro-eval.yaml`) and ensure we now see a controlled validation failure message (or a successful preview using the placeholder prompt).
   - Exercise the redteam setup UI preview feature with both literal prompts and template-only prompts.
2. Automated:
   - Ensure `npm test` and `npm run test:app` continue to pass.
   - Consider adding an e2e smoke test for `promptfoo redteam run` using a template prompt to catch regressions.
