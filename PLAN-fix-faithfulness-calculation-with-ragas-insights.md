# Plan: Fix Faithfulness Calculation with RAGAS Insights (Issue #2468)

## Issue Summary

**GitHub Issue**: #2468 - "Faithfulness calculation with no verdicts not covered"
**Created**: 2024-12-19
**Status**: Open
**Priority**: Medium

## RAGAS Analysis

After examining the RAGAS implementation in `src/external/prompts/ragas.ts`, I can see that RAGAS uses a very specific format for faithfulness verdicts:

```
Final verdict for each statement in order: No. No. Yes. No. Yes.
```

The RAGAS prompt (`CONTEXT_FAITHFULNESS_NLI_STATEMENTS`) explicitly instructs the LLM to:

1. Provide explanations for each statement
2. Give a verdict (Yes/No) for each statement
3. Provide a final verdict summary in the exact format: "Final verdict for each statement in order: No. No. Yes. No. Yes."

## Problem Analysis

### Current Implementation Issues

1. **Strict Format Assumption**: The current code assumes the LLM will always follow the RAGAS format exactly
2. **No Fallback Handling**: When the format isn't followed, the calculation proceeds with incorrect assumptions
3. **Binary Logic**: The code only handles two cases:
   - "Final verdict for each statement in order:" format
   - "verdict: no" pattern counting

### Specific Problems Identified

**Problem 1: No Verdicts Case**

```typescript
// Current code assumes one of two formats will always be present
if (verdicts.includes(finalAnswer)) {
  // Handle RAGAS format
} else {
  // Assume "verdict: no" pattern - THIS IS THE BUG
  score = (verdicts.split('verdict: no').length - 1) / statements.length;
}
```

**Problem 2: Refusal Responses**
When LLM responds with "I apologize, but I cannot create statements...", neither format is matched, but the calculation still proceeds using the else branch.

**Problem 3: Format Variations**
LLMs may provide verdicts in different formats:

- "Final verdict: No, No, Yes, No, Yes"
- "Verdicts: [No, No, Yes, No, Yes]"
- "Statement 1: No, Statement 2: No, Statement 3: Yes..."

## RAGAS-Inspired Solution

### 1. Enhanced Verdict Parsing

```typescript
// More robust verdict detection
const RAGAS_FINAL_ANSWER = 'Final verdict for each statement in order:';
const ALTERNATIVE_FORMATS = ['Final verdict:', 'Verdicts:', 'Final answer:', 'Statement verdicts:'];

let verdicts = resp.output.toLowerCase().trim();
let score: number;

// Check for RAGAS format first
if (verdicts.includes(RAGAS_FINAL_ANSWER)) {
  verdicts = verdicts.slice(verdicts.indexOf(RAGAS_FINAL_ANSWER) + RAGAS_FINAL_ANSWER.length);
  score = calculateRagasScore(verdicts, statements.length);
}
// Check for alternative formats
else if (ALTERNATIVE_FORMATS.some((format) => verdicts.includes(format.toLowerCase()))) {
  score = parseAlternativeVerdictFormats(verdicts, statements.length);
}
// Check for individual "verdict: no" patterns (legacy support)
else if (verdicts.includes('verdict: no')) {
  score = (verdicts.split('verdict: no').length - 1) / statements.length;
}
// No verdicts found - handle gracefully
else {
  return handleNoVerdictsCase(verdicts, statements.length, tokensUsed);
}
```

### 2. RAGAS-Style Score Calculation

```typescript
function calculateRagasScore(verdictsText: string, statementsCount: number): number {
  // RAGAS expects format: "No. No. Yes. No. Yes."
  // Count "No" verdicts (each followed by a period)
  const noVerdicts = (verdictsText.match(/\bno\./g) || []).length;

  // Validate we have the expected number of verdicts
  if (noVerdicts > statementsCount) {
    logger.warn('More verdicts than statements - truncating', {
      verdictsCount: noVerdicts,
      statementsCount,
    });
    return statementsCount / statementsCount; // Worst case
  }

  return noVerdicts / statementsCount;
}
```

### 3. Alternative Format Parsing

```typescript
function parseAlternativeVerdictFormats(verdictsText: string, statementsCount: number): number {
  // Try to extract verdicts from various formats
  // Format 1: "Final verdict: No, No, Yes, No, Yes"
  const commaFormatMatch = verdictsText.match(/[:\s](no|yes)(?:\s*,\s*(no|yes))+/i);
  if (commaFormatMatch) {
    const verdicts = commaFormatMatch[0].split(',').map((v) => v.trim().toLowerCase());
    const noCount = verdicts.filter((v) => v === 'no').length;
    return Math.min(noCount, statementsCount) / statementsCount;
  }

  // Format 2: "Statement 1: No, Statement 2: No, ..."
  const statementFormatMatches = verdictsText.match(/statement\s+\d+:\s*(no|yes)/gi);
  if (statementFormatMatches && statementFormatMatches.length <= statementsCount) {
    const noCount = statementFormatMatches.filter((m) => m.includes('no')).length;
    return noCount / statementsCount;
  }

  // If we can't parse, fall back to conservative estimate
  logger.warn('Unable to parse alternative verdict format', { verdictsText });
  return 0.5; // Neutral score when format is unclear
}
```

### 4. No Verdicts Handling (RAGAS-Inspired)

```typescript
function handleNoVerdictsCase(
  verdictsText: string,
  statementsCount: number,
  tokensUsed: Partial<TokenUsage>,
): Omit<GradingResult, 'assertion'> {
  // Check for refusal patterns (RAGAS would consider this a failure)
  const refusalPatterns = [
    'i cannot',
    'i apologize',
    'i am unable',
    'no verdicts',
    'cannot determine',
    'insufficient information',
    'not enough context',
  ];

  const isRefusal = refusalPatterns.some((pattern) => verdictsText.toLowerCase().includes(pattern));

  if (isRefusal) {
    return {
      pass: false,
      score: 0,
      reason: 'LLM refused to provide faithfulness verdicts (insufficient context or capability)',
      tokensUsed,
    };
  }

  // Check if this looks like a malformed attempt
  const hasVerdictLikeContent =
    verdictsText.includes('verdict') ||
    verdictsText.includes('statement') ||
    verdictsText.includes('answer');

  if (hasVerdictLikeContent) {
    logger.warn('Malformed verdict response detected', { verdictsText });
    return {
      pass: false,
      score: 0.5, // Neutral score for malformed responses
      reason: 'Malformed verdict response - unable to parse faithfulness results',
      tokensUsed,
    };
  }

  // No verdicts and no refusal - this shouldn't happen with proper RAGAS prompts
  // But handle gracefully anyway
  return {
    pass: false,
    score: 0,
    reason: 'No faithfulness verdicts provided in LLM response',
    tokensUsed,
  };
}
```

### 5. Enhanced Validation (RAGAS Best Practices)

```typescript
// Add comprehensive validation
if (statementsCount === 0) {
  return {
    pass: false,
    score: 0,
    reason: 'No statements generated for faithfulness calculation',
    tokensUsed,
  };
}

// Validate the calculated score
if (isNaN(score) || !isFinite(score)) {
  logger.error('Invalid score calculated', {
    verdicts: verdictsText,
    statementsCount,
    rawScore: score,
  });
  score = 1.0; // Worst case for invalid calculations
}

// Ensure score is within valid range (RAGAS scores are always [0,1])
score = Math.max(0, Math.min(1, score));

// Final score calculation (RAGAS: 1 - (no_verdicts / total_statements))
const finalScore = 1 - score;

// Final validation
if (finalScore < 0 || finalScore > 1 || isNaN(finalScore)) {
  logger.error('Final faithfulness score out of range', {
    originalScore: score,
    finalScore,
    verdicts: verdictsText,
    statementsCount,
  });
  // Fall back to neutral score
  return {
    pass: false,
    score: 0.5,
    reason: 'Faithfulness calculation error - invalid score range',
    tokensUsed,
  };
}
```

## Implementation Plan

### Phase 1: Add Helper Functions

1. `calculateRagasScore()` - Handle RAGAS format specifically
2. `parseAlternativeVerdictFormats()` - Handle common format variations
3. `handleNoVerdictsCase()` - Graceful handling of missing verdicts
4. `isRefusalResponse()` - Detect LLM refusals

### Phase 2: Refactor Main Logic

1. Replace binary if/else with multi-format detection
2. Add comprehensive input validation
3. Implement score range validation
4. Add detailed logging at each step

### Phase 3: Add RAGAS-Specific Enhancements

1. Better pattern matching for RAGAS format
2. Validation of verdict count vs statement count
3. Handling of malformed RAGAS responses
4. Conservative fallbacks for unclear cases

### Phase 4: Testing

1. **Unit tests** for each helper function
2. **Integration tests** with various LLM response formats
3. **Regression tests** for existing functionality
4. **Edge case tests** for refusal responses

## Expected Benefits

1. **Fixes the reported bug**: Proper handling of "no verdicts" case
2. **Improves robustness**: Handles multiple verdict formats
3. **Better error handling**: Graceful degradation for edge cases
4. **RAGAS compatibility**: Aligns with RAGAS best practices
5. **Better debugging**: Comprehensive logging
6. **Prevents negative scores**: Proper score validation

## Files to Modify

- `src/matchers.ts` - Main faithfulness calculation
- `test/matchers.test.ts` - Add comprehensive test cases

## Testing Strategy

### Test Cases to Add

1. **RAGAS Format Tests**:
   - Perfect RAGAS format response
   - RAGAS format with extra text
   - RAGAS format with missing verdicts

2. **Alternative Format Tests**:
   - Comma-separated verdicts
   - Statement-by-statement format
   - JSON array format

3. **Edge Case Tests**:
   - Refusal responses
   - Empty responses
   - Malformed responses
   - More verdicts than statements

4. **Error Condition Tests**:
   - Division by zero
   - NaN scores
   - Infinite scores
   - Negative scores

## Risk Assessment

- **Low risk**: Changes are localized to faithfulness calculation
- **Backward compatible**: Existing RAGAS format continues to work
- **Improves reliability**: Better handling of edge cases
- **Aligns with RAGAS**: Uses RAGAS best practices

## Success Criteria

1. ✅ Faithfulness handles RAGAS format correctly
2. ✅ Faithfulness handles alternative formats gracefully
3. ✅ No more negative scores
4. ✅ Refusal responses detected and handled properly
5. ✅ All scores validated to be in [0, 1] range
6. ✅ Comprehensive logging for debugging
7. ✅ All existing tests continue to pass
8. ✅ New test cases cover edge conditions

## Timeline

- Analysis with RAGAS insights: ✅ Complete
- Implementation: 2-3 hours
- Testing: 2-3 hours
- Review & Documentation: 1 hour
- Total: 5-7 hours

## Key Insights from RAGAS

1. **Strict Format**: RAGAS expects very specific verdict format
2. **Explicit Instructions**: RAGAS prompts clearly instruct LLM on format
3. **Validation**: RAGAS likely validates verdict count matches statements
4. **Error Handling**: RAGAS probably has robust error handling
5. **Scoring**: RAGAS uses simple ratio calculation: no_verdicts / total_statements

This RAGAS-inspired approach should provide a much more robust and reliable faithfulness calculation that handles the edge cases reported in issue #2468 while maintaining compatibility with existing functionality.
