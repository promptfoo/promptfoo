# Plan: Fix Faithfulness Calculation (Issue #2468)

## Issue Summary

**GitHub Issue**: #2468 - "Faithfulness calculation with no verdicts not covered"
**Created**: 2024-12-19
**Status**: Open
**Priority**: Medium

## Problem Analysis

The faithfulness calculation in `src/matchers.ts` has several issues:

### 1. No Verdicts Handling

When the LLM response contains no verdicts (e.g., "I apologize, but I cannot create statements or provide an analysis based on the given context..."), the current logic incorrectly calculates the score.

**Current problematic code** (lines ~1537-1542):

```typescript
let finalAnswer = 'Final verdict for each statement in order:';
finalAnswer = finalAnswer.toLowerCase();
let verdicts = resp.output.toLowerCase().trim();
let score: number;
if (verdicts.includes(finalAnswer)) {
  verdicts = verdicts.slice(verdicts.indexOf(finalAnswer) + finalAnswer.length);
  score =
    verdicts.split('.').filter((answer) => answer.trim() !== '' && !answer.includes('yes')).length /
    statements.length;
} else {
  score = (verdicts.split('verdict: no').length - 1) / statements.length;
}
score = 1 - score;
```

### 2. Edge Cases Not Handled

- **No verdicts found**: When the response contains neither "Final verdict for each statement in order:" nor "verdict: no"
- **Empty or refusal responses**: When the LLM refuses to provide verdicts
- **Negative scores**: The reporter mentioned getting a negative score of -0.2

### 3. Logic Issues

- The `else` branch assumes all responses contain "verdict: no" patterns
- No validation that the calculated score is within valid range [0, 1]
- No handling for division by zero if `statements.length` is 0

## Root Cause

The faithfulness calculation assumes the LLM will always provide verdicts in one of two formats:

1. "Final verdict for each statement in order:" followed by verdicts
2. Multiple "verdict: no" occurrences

When neither pattern is found, the calculation still proceeds, leading to incorrect scores.

## Proposed Solution

### 1. Add Proper Validation

```typescript
// Validate we have statements to work with
if (statements.length === 0) {
  return {
    pass: false,
    score: 0,
    reason: 'No statements found for faithfulness calculation',
    tokensUsed,
  };
}
```

### 2. Handle No Verdicts Case

```typescript
let score: number;
const hasFinalAnswerFormat = verdicts.includes(finalAnswer);
const hasVerdictNoPattern = verdicts.includes('verdict: no');

if (hasFinalAnswerFormat) {
  // Existing logic for final answer format
  verdicts = verdicts.slice(verdicts.indexOf(finalAnswer) + finalAnswer.length);
  const noVerdictsCount = verdicts
    .split('.')
    .filter((answer) => answer.trim() !== '' && !answer.includes('yes')).length;
  score = noVerdictsCount / statements.length;
} else if (hasVerdictNoPattern) {
  // Existing logic for verdict: no pattern
  score = (verdicts.split('verdict: no').length - 1) / statements.length;
} else {
  // No verdicts found - handle gracefully
  logger.warn('Faithfulness calculation: No verdicts found in LLM response', {
    response: resp.output,
    statementsCount: statements.length,
  });

  // Check if this is a refusal or inability to provide verdicts
  const refusalPatterns = [
    'i cannot',
    'i apologize',
    'i am unable',
    'no verdicts',
    'cannot determine',
  ];

  const isRefusal = refusalPatterns.some((pattern) => verdicts.includes(pattern));

  if (isRefusal) {
    return {
      pass: false,
      score: 0,
      reason: 'LLM refused to provide faithfulness verdicts',
      tokensUsed,
    };
  }

  // If we can't determine, assume worst case
  score = 1.0; // Maximum penalty for no verdicts
}
```

### 3. Add Score Validation

```typescript
// Ensure score is within valid range
score = Math.max(0, Math.min(1, score));

// Final score calculation
score = 1 - score;

// Validate final score
if (score < 0 || score > 1) {
  logger.error('Faithfulness calculation produced invalid score', {
    originalScore: score,
    verdicts,
    statementsCount: statements.length,
  });
  score = Math.max(0, Math.min(1, score));
}
```

### 4. Enhanced Logging

Add debug logging to help diagnose issues:

```typescript
logger.debug('Faithfulness calculation', {
  hasFinalAnswerFormat,
  hasVerdictNoPattern,
  statementsCount: statements.length,
  verdictsLength: verdicts.length,
  rawScore: scoreBeforeInversion,
  finalScore: score,
});
```

## Implementation Plan

### Step 1: Add Input Validation

- Check for empty statements array
- Validate context input
- Add early returns for invalid cases

### Step 2: Refactor Verdict Detection Logic

- Separate the two verdict formats clearly
- Add explicit handling for "no verdicts" case
- Detect refusal patterns

### Step 3: Add Score Validation

- Ensure scores are within [0, 1] range
- Add logging for edge cases
- Handle division by zero

### Step 4: Add Comprehensive Logging

- Debug logs for each calculation step
- Warning logs for edge cases
- Error logs for invalid states

### Step 5: Write Tests

- Test case with no verdicts
- Test case with refusal response
- Test case with empty statements
- Test edge cases that could produce negative scores

## Expected Impact

1. **Fixes the reported bug**: No more incorrect scores when LLM provides no verdicts
2. **Improves robustness**: Better handling of edge cases and refusal responses
3. **Better debugging**: Enhanced logging helps diagnose issues
4. **Prevents negative scores**: Score validation ensures valid range
5. **Maintains backward compatibility**: Existing valid cases continue to work

## Files to Modify

- `src/matchers.ts` - Main faithfulness calculation logic
- `test/matchers.test.ts` - Add test cases for edge cases

## Testing Strategy

1. **Unit tests**: Add specific test cases for the edge conditions
2. **Integration tests**: Test with real LLM responses that refuse to provide verdicts
3. **Regression tests**: Ensure existing functionality still works
4. **Manual testing**: Test with the specific example from the issue

## Risk Assessment

- **Low risk**: Changes are localized to the faithfulness calculation
- **Backward compatible**: Existing valid responses continue to work
- **Improves reliability**: Better error handling and validation
- **No breaking changes**: Only adds handling for previously unhandled cases

## Success Criteria

1. Faithfulness calculation handles "no verdicts" case gracefully
2. No more negative scores reported
3. Refusal responses are properly detected and handled
4. All existing tests continue to pass
5. New test cases cover the edge conditions

## Timeline Estimate

- Analysis: ✅ Complete
- Implementation: 1-2 hours
- Testing: 1-2 hours
- Review & Documentation: 1 hour
- Total: 3-5 hours

## Related Issues

This fix addresses the core issue reported in #2468 and should also prevent the negative score issue mentioned by the reporter.
