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

## Limitations & Future Work

### What This Fix Does

- **Prevents crash**: The invariant error no longer crashes the evaluation
- **Provides helpful message**: Users see a clear explanation of what went wrong
- **Preserves metadata**: Plugin/strategy info is retained for reporting and UI filtering

### What This Fix Does NOT Do

1. **Does not allow target preview to succeed**: The UI's "Test Target" flow still sees a failed test (pass=false), so the target cannot be marked as "tested" and the user may not be able to proceed in the setup workflow.

2. **Does not solve the root cause**: The original expectation was to validate HTTP connectivity before attack generation. This fix is a safety net, not a complete solution.

### Recommended Future Work

To fully resolve Issue #5995, the frontend needs changes to either:

**(a) Avoid scheduling redteam assertions during preview calls:**
- Detect when prompts are only templates (match `/\{\{.*\}\}/`)
- Use `/providers/test` endpoint for connectivity testing without assertions
- Only attach assertions after actual test case generation

**(b) Inject a placeholder prompt for preview runs:**
- When preview is requested with template prompts, inject a static placeholder like `'Preview probe for target validation'`
- This allows the assertion to run and potentially pass (if the target responds reasonably)

**Implementation location**: `src/app/src/pages/redteam/setup/components/` - specifically wherever the test/preview button triggers an evaluation

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
