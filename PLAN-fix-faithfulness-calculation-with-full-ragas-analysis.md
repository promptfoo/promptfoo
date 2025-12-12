# Plan: Fix Faithfulness Calculation with Full RAGAS Analysis (Issue #2468)

## Issue Summary

**GitHub Issue**: #2468 - "Faithfulness calculation with no verdicts not covered"
**Created**: 2024-12-19
**Status**: Open
**Priority**: Medium

## Complete RAGAS Analysis

After examining the full RAGAS implementation from `https://github.com/vibrantlabsai/ragas/blob/main/src/ragas/metrics/_faithfulness.py`, I can now see the complete approach:

### RAGAS Faithfulness Process

1. **Statement Generation** (`StatementGeneratorPrompt`):
   - Input: Question + Answer
   - Output: List of statements (one per sentence, with pronouns resolved)
   - Format: JSON array of strings

2. **Verdict Generation** (`NLIStatementPrompt`):
   - Input: Context + Statements
   - Output: List of `StatementFaithfulnessAnswer` objects with:
     - `statement`: Original statement
     - `reason`: Explanation for verdict
     - `verdict`: 0 (not faithful) or 1 (faithful)

3. **Score Calculation** (`_compute_score`):
   - `score = faithful_statements / total_statements`
   - Where `faithful_statements = sum(verdicts)`
   - Returns `np.nan` if no statements generated

### Key Differences from Promptfoo Implementation

| Aspect                   | RAGAS Approach                              | Promptfoo Current Approach           |
| ------------------------ | ------------------------------------------- | ------------------------------------ |
| **Statement Generation** | Separate LLM call with explicit JSON format | Uses `splitIntoSentences()` function |
| **Verdict Format**       | Structured JSON with `verdict: 0/1`         | Free-form text parsing for "No/Yes"  |
| **Score Calculation**    | Simple ratio: faithful / total              | Complex text parsing with regex      |
| **Error Handling**       | Returns `np.nan` for no statements          | No explicit error handling           |
| **Validation**           | Checks for empty statements                 | No validation                        |

## Problem Analysis

### Current Promptfoo Issues

1. **Fragile Text Parsing**:

   ```typescript
   // Current code tries to parse free-form text
   if (verdicts.includes(finalAnswer)) {
     verdicts = verdicts.slice(...);
     score = verdicts.split('.').filter(...).length / statements.length;
   } else {
     score = (verdicts.split('verdict: no').length - 1) / statements.length;
   }
   ```

2. **No Structured Output**: Relies on LLM following exact text format
3. **No Error Handling**: When parsing fails, calculation proceeds with invalid data
4. **Complex Logic**: Multiple regex patterns and string manipulations

### Specific Bugs Identified

**Bug 1: No Verdicts Case**
When LLM responds with refusal or no verdicts, the `else` branch incorrectly assumes "verdict: no" pattern exists.

**Bug 2: Format Variations**
LLMs may respond in different ways:

- "I cannot determine faithfulness from this context"
- "The answer doesn't contain enough information"
- Empty or malformed responses

**Bug 3: Score Validation**
No checks for:

- Division by zero (`statements.length === 0`)
- Invalid scores (NaN, Infinity, negative values)
- Score range validation ([0, 1])

## RAGAS-Inspired Solution

### 1. Adopt RAGAS Score Calculation

```typescript
// Replace complex text parsing with RAGAS-style calculation
function calculateRagasScore(verdicts: StatementFaithfulnessAnswer[]): number {
  if (verdicts.length === 0) {
    logger.warn('No verdicts provided');
    return 0; // or return neutral score
  }

  const faithfulCount = verdicts.filter((v) => v.verdict === 1).length;
  const score = faithfulCount / verdicts.length;

  // RAGAS validation
  if (isNaN(score) || !isFinite(score)) {
    logger.error('Invalid score calculated', { faithfulCount, total: verdicts.length });
    return 0.5; // Neutral fallback
  }

  return score;
}
```

### 2. Structured Verdict Parsing

```typescript
// Parse both RAGAS JSON format and legacy text format
function parseVerdicts(llmOutput: string): StatementFaithfulnessAnswer[] {
  // Try RAGAS JSON format first
  try {
    const parsed = JSON.parse(llmOutput);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].verdict !== undefined) {
      return parsed.map((v) => ({
        statement: v.statement || '',
        reason: v.reason || 'No reason provided',
        verdict: v.verdict === 1 ? 1 : 0,
      }));
    }
  } catch (e) {
    // Not JSON format, continue to text parsing
  }

  // Fallback to legacy text parsing
  return parseLegacyVerdictFormat(llmOutput);
}
```

### 3. Legacy Format Support (Backward Compatibility)

```typescript
function parseLegacyVerdictFormat(text: string): StatementFaithfulnessAnswer[] {
  const RAGAS_FINAL_ANSWER = 'Final verdict for each statement in order:';
  const statements = [];

  if (text.includes(RAGAS_FINAL_ANSWER)) {
    const verdictsPart = text.slice(text.indexOf(RAGAS_FINAL_ANSWER) + RAGAS_FINAL_ANSWER.length);
    const verdicts = verdictsPart.split('.').filter((v) => v.trim());

    return verdicts.map((verdict, index) => ({
      statement: `Statement ${index + 1}`,
      reason: 'Legacy format - no detailed reason',
      verdict: verdict.trim().toLowerCase() === 'yes' ? 1 : 0,
    }));
  }

  // Handle refusal responses
  if (isRefusalResponse(text)) {
    return []; // Will be handled as error case
  }

  // Last resort: try to find individual verdict patterns
  return parseIndividualVerdictPatterns(text);
}
```

### 4. Comprehensive Error Handling

```typescript
// Main calculation with RAGAS-style error handling
async function calculateFaithfulness(
  llmOutput: string,
  statements: string[],
  tokensUsed: Partial<TokenUsage>,
): Promise<Omit<GradingResult, 'assertion'>> {
  // Input validation
  if (statements.length === 0) {
    return {
      pass: false,
      score: 0,
      reason: 'No statements generated for faithfulness calculation',
      tokensUsed,
    };
  }

  // Parse verdicts
  const verdicts = parseVerdicts(llmOutput);

  // Handle empty verdicts (RAGAS returns np.nan)
  if (verdicts.length === 0) {
    if (isRefusalResponse(llmOutput)) {
      return {
        pass: false,
        score: 0,
        reason: 'LLM refused to provide faithfulness verdicts',
        tokensUsed,
      };
    }

    return {
      pass: false,
      score: 0.5, // Neutral score when no verdicts
      reason: 'No faithfulness verdicts provided',
      tokensUsed,
    };
  }

  // Validate verdict count matches statements count
  if (verdicts.length !== statements.length) {
    logger.warn('Verdict count mismatch', {
      expected: statements.length,
      actual: verdicts.length,
    });
    // Use minimum count to avoid index errors
    const effectiveCount = Math.min(verdicts.length, statements.length);
    verdicts.splice(effectiveCount); // Truncate if needed
  }

  // Calculate score (RAGAS: faithful / total)
  const faithfulCount = verdicts.filter((v) => v.verdict === 1).length;
  const score = faithfulCount / verdicts.length;

  // Final validation
  if (isNaN(score) || !isFinite(score) || score < 0 || score > 1) {
    logger.error('Invalid faithfulness score', { score, faithfulCount, total: verdicts.length });
    return {
      pass: false,
      score: 0.5,
      reason: 'Faithfulness calculation error',
      tokensUsed,
    };
  }

  // RAGAS: score = faithful / total (no 1 - score inversion)
  const pass = score >= threshold - Number.EPSILON;

  return {
    pass,
    score,
    reason: pass
      ? `Faithfulness ${score.toFixed(2)} is >= ${threshold}`
      : `Faithfulness ${score.toFixed(2)} is < ${threshold}`,
    tokensUsed,
  };
}
```

### 5. Refusal Detection

```typescript
function isRefusalResponse(text: string): boolean {
  const lowerText = text.toLowerCase();
  const refusalPatterns = [
    'i cannot',
    'i apologize',
    'i am unable',
    'insufficient information',
    'not enough context',
    'cannot determine',
    'no verdicts',
    'refuse to answer',
    'against my policy',
  ];

  return refusalPatterns.some((pattern) => lowerText.includes(pattern));
}
```

## Implementation Plan

### Phase 1: Add Type Definitions

```typescript
// Add to types/index.ts or create new types
interface StatementFaithfulnessAnswer {
  statement: string;
  reason: string;
  verdict: 0 | 1;
}
```

### Phase 2: Refactor Parsing Logic

1. `parseVerdicts()` - Main parsing function
2. `parseLegacyVerdictFormat()` - Backward compatibility
3. `parseIndividualVerdictPatterns()` - Fallback parsing
4. `isRefusalResponse()` - Refusal detection

### Phase 3: Update Main Calculation

1. Replace complex text parsing with structured approach
2. Add comprehensive validation
3. Implement RAGAS-style score calculation
4. Add detailed logging

### Phase 4: Add Helper Functions

1. `calculateRagasScore()` - RAGAS-compatible scoring
2. `validateVerdictCount()` - Count validation
3. `handleEmptyVerdicts()` - Error handling

### Phase 5: Testing

1. **Unit tests** for each parsing function
2. **Integration tests** with various LLM formats
3. **Regression tests** for existing functionality
4. **Edge case tests** for refusal responses

## Expected Benefits

1. **Fixes Reported Bug**: Proper handling of "no verdicts" case
2. **RAGAS Compatibility**: Aligns with RAGAS best practices
3. **Improved Robustness**: Handles multiple response formats
4. **Better Error Handling**: Graceful degradation for edge cases
5. **Simpler Logic**: Replaces complex regex with structured parsing
6. **Prevents Negative Scores**: Proper score validation
7. **Backward Compatible**: Maintains support for existing formats

## Files to Modify

- `src/matchers.ts` - Main faithfulness calculation
- `src/types/index.ts` - Add type definitions
- `test/matchers.test.ts` - Add comprehensive test cases

## Testing Strategy

### Test Cases to Add

1. **RAGAS JSON Format**:
   - Perfect RAGAS JSON response
   - RAGAS JSON with missing fields
   - RAGAS JSON with extra fields

2. **Legacy Text Format**:
   - Perfect RAGAS text format
   - RAGAS text with variations
   - Malformed RAGAS text

3. **Refusal Responses**:
   - Various refusal patterns
   - Empty responses
   - Unrelated responses

4. **Edge Cases**:
   - More verdicts than statements
   - Fewer verdicts than statements
   - Invalid JSON
   - Non-JSON text

5. **Error Conditions**:
   - Division by zero
   - NaN scores
   - Infinite scores
   - Negative scores

## Risk Assessment

- **Low Risk**: Changes are localized to faithfulness calculation
- **Backward Compatible**: Supports both RAGAS and legacy formats
- **Improves Reliability**: Better error handling and validation
- **Aligns with RAGAS**: Uses proven RAGAS approach
- **No Breaking Changes**: Existing valid responses continue to work

## Success Criteria

1. ✅ Faithfulness handles RAGAS JSON format correctly
2. ✅ Faithfulness handles legacy text format gracefully
3. ✅ Faithfulness handles refusal responses properly
4. ✅ No more negative scores or invalid calculations
5. ✅ All scores validated to be in [0, 1] range
6. ✅ Comprehensive logging for debugging
7. ✅ All existing tests continue to pass
8. ✅ New test cases cover edge conditions
9. ✅ Backward compatibility maintained

## Timeline

- Analysis with full RAGAS implementation: ✅ Complete
- Implementation: 3-4 hours
- Testing: 3-4 hours
- Review & Documentation: 1 hour
- Total: 7-9 hours

## Key Insights from Full RAGAS Implementation

1. **Two-Step Process**: Statement generation → Verdict evaluation
2. **Structured Output**: Uses JSON with explicit verdict field (0/1)
3. **Simple Scoring**: faithful_statements / total_statements
4. **Error Handling**: Returns np.nan for invalid cases
5. **Validation**: Checks for empty statements array
6. **No Text Parsing**: Avoids fragile regex patterns

## Migration Path

### Short-Term (Current Fix)

- Keep existing statement generation (`splitIntoSentences`)
- Add structured verdict parsing with fallback
- Implement RAGAS-style scoring
- Add comprehensive error handling

### Long-Term (Future Enhancement)

- Consider adopting full RAGAS two-step approach
- Add JSON output requirement to prompts
- Implement proper statement generation LLM call
- Add batch processing for large documents

This RAGAS-inspired approach provides a robust solution that fixes the reported issues while maintaining backward compatibility and aligning with industry best practices.
