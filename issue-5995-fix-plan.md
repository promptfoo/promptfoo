# Fix Plan for Issue #5995

## Issue Summary

Red teaming plugins `harmful:misinformation-disinformation` and `promptfoo:redteam:harmful:specialized-advice` fail with error:

```
Error: Invariant failed: Grader promptfoo:redteam:harmful:misinformation-disinformation must have a prompt
```

## Investigation Findings

### Root Cause Analysis

The error occurs at `src/assertions/redteam.ts:43`:

```typescript
invariant(prompt, `Grader ${baseType} must have a prompt`);
```

This invariant check fails when the `prompt` parameter passed to `handleRedteam` is undefined or empty.

### Author's Analysis

The author's observation is **partially correct**. The error message is confusing because it says "must have a prompt", which makes it seem like the plugin configuration is missing a prompt. However, the actual issue is that the **evaluation is running without generated test cases**.

### Maintainer's Explanation

The maintainer (mldangelo) correctly identified the issue:

> "The UI Setup's test/preview feature tries to run a quick validation of your target without going through the full redteam generate step first. Since your config uses prompts: - '{{prompt}}' (a template) there's no prompt to test with."

### Code Flow Analysis

1. **Normal Flow (CLI `redteam run`)**:
   - `doRedteamRun` in `src/redteam/shared.ts` calls `doGenerateRedteam` first
   - Generation creates actual test cases with real prompts
   - If generation fails, it returns early: "No test cases generated. Skipping scan."
   - This flow is protected and works correctly

2. **Problematic Flow (UI test/preview)**:
   - Some UI feature attempts to run an evaluation directly
   - Bypasses the test case generation step
   - Uses the config template `prompts: ['{{prompt}}']` without variables
   - The template doesn't get filled in, resulting in empty/undefined prompt
   - When assertions run, `handleRedteam` receives undefined prompt
   - Invariant check fails with confusing error message

### Graders Are Properly Registered

Both graders exist and are correctly registered in `src/redteam/graders.ts`:

- `promptfoo:redteam:harmful:misinformation-disinformation` → `MisinformationDisinformationGrader`
- `promptfoo:redteam:harmful:specialized-advice` → `SpecializedAdviceGrader`

## Recommended Fixes

### Option 1: Improve Error Message (Minimal Change)

**Location**: `src/assertions/redteam.ts:43`

Change the error message to be more informative:

```typescript
// Before
invariant(prompt, `Grader ${baseType} must have a prompt`);

// After
invariant(
  prompt,
  `Grader ${baseType} requires a prompt. This usually means test cases were not generated properly. ` +
    `Please run 'redteam run' to generate test cases first, or ensure your prompts contain actual values instead of templates.`,
);
```

### Option 2: Graceful Handling (Better UX)

**Location**: `src/assertions/redteam.ts`

Instead of throwing an error, return a failing grade with a helpful message:

```typescript
export const handleRedteam = async ({
  assertion,
  baseType,
  test,
  prompt,
  outputString,
  provider,
  renderedValue,
  providerResponse,
}: AssertionParams): Promise<GradingResult> => {
  // ... stored result check ...

  const grader = getGraderById(assertion.type);
  invariant(grader, `Unknown grader: ${baseType}`);

  // Handle missing prompt gracefully
  if (!prompt) {
    return {
      pass: false,
      score: 0,
      reason:
        `Cannot grade: No prompt was provided for ${baseType}. ` +
        `This usually means test cases were not generated. ` +
        `Run 'redteam run' to generate test cases first.`,
      assertion,
    };
  }

  // ... rest of the function ...
};
```

### Option 3: Prevent UI from Running Eval Without Generation

**Location**: UI code that triggers the evaluation

Add a check to ensure test cases are generated before running evaluation:

```typescript
// In the UI component that triggers evaluation
if (!config.tests || config.tests.length === 0) {
  showToast('No test cases generated. Please run generation first.', 'error');
  return;
}
```

## Implementation Recommendation

**Implement both Option 1 and Option 2**:

1. **Option 1** improves the error message for any code paths that might still hit the invariant
2. **Option 2** provides a better user experience by gracefully handling the missing prompt case

This combination ensures:

- Users get a clear, actionable error message
- The system doesn't crash unexpectedly
- The root cause is clearly communicated

## Testing Plan

### Unit Tests

Add test cases to `test/assertions/redteam.test.ts`:

```typescript
it('returns a failing grade when prompt is undefined', async () => {
  const grade = await handleRedteam({
    assertion: { type: 'promptfoo:redteam:harmful:misinformation-disinformation' },
    baseType: 'promptfoo:redteam:harmful:misinformation-disinformation',
    // ... other params
    prompt: undefined, // or ''
    // ...
  });

  expect(grade.pass).toBe(false);
  expect(grade.reason).toContain('No prompt was provided');
});
```

### Integration Tests

Create a test that simulates the user's scenario:

1. Create a redteam config with `prompts: ['{{prompt}}']`
2. Try to run evaluation without generating test cases
3. Verify the error message is clear and actionable

### Manual Testing

1. Open the UI setup
2. Configure plugins including `harmful:misinformation-disinformation`
3. Try to trigger the test/preview feature
4. Verify the error is handled gracefully with a clear message

## Additional Considerations

### Long-term Fix

Investigate and prevent the UI from allowing evaluation runs without proper test case generation:

1. Identify all UI code paths that could trigger an evaluation
2. Add guards to ensure test cases exist before running
3. Provide clear feedback to users about what's needed

### Documentation

Update documentation to clarify:

- The difference between test case generation and evaluation
- Why templates like `{{prompt}}` need to be filled in
- How to properly run redteam tests

## Files to Modify

1. `src/assertions/redteam.ts` - Improve error handling
2. `test/assertions/redteam.test.ts` - Add unit tests
3. Potentially UI components that trigger evaluations without generation

## Estimated Effort

- **Option 1 only**: 30 minutes
- **Options 1 + 2**: 1-2 hours
- **Full fix including Option 3**: 3-4 hours

## Related Issues

This issue might be related to:

- Any other code paths that could run evaluations without proper test cases
- Template rendering issues in the evaluation pipeline
