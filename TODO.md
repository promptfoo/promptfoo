# Red Team Strategy Documentation Fixes TODO

This file contains identified documentation issues that need to be fixed across various red team strategy documentation files.

## High Priority Fixes

### 1. Fix Leetspeak Strategy Example Direction
**File**: `site/docs/red-team/strategies/leetspeak.md`
**Issue**: The third example in the table is backwards
**Current**: `"h4ck th3 pl4n3t" → "hack the planet"`
**Should be**: `"hack the planet" → "h4ck th3 pl4n3t"`
**Task**: Reverse the example to show the correct transformation direction

### 2. Fix ROT13 Incorrect Example
**File**: `site/docs/red-team/strategies/rot13.md`
**Issue**: The third example shows incomplete transformation
**Current**: `"ROT13 Pna lbh uryc zr unpx?" → "EBG13 Can you help me hack?"`
**Should be**: `"ROT13 Can you help me hack?" → "EBG13 Pna lbh uryc zr unpx?"`
**Task**: Correct the example to show proper full transformation of all letters

### 3. Fix Iterative Strategy Default Value
**File**: `site/docs/red-team/strategies/iterative.md`
**Issue**: Documentation states default `numIterations` is 10, but implementation shows 4
**Task**: Update documentation to reflect the correct default value of 4

### 4. Fix Citation Strategy YAML Syntax
**File**: `site/docs/red-team/strategies/citation.md`
**Issue**: Line 23 shows incorrect YAML syntax
**Current**: Shows `citation:` with trailing colon
**Should be**: Use proper `config:` syntax like other strategies
**Task**: Fix the YAML example to use correct syntax

## Medium Priority Fixes

### 5. Update Homoglyph Documentation
**File**: `site/docs/red-team/strategies/homoglyph.md`
**Issue**: Missing information about number transformations
**Task**: Add documentation that numbers are also replaced with mathematical monospace digits (0→𝟶, 1→𝟷, etc.)

### 6. Clarify Image Strategy Guidance
**File**: `site/docs/red-team/strategies/image.md`
**Issue**: Line 60 provides confusing guidance about disabling strategies
**Current**: "You should only disable all other strategies when using the image strategy"
**Should be**: Clarify that you need to disable other strategies only when you want ONLY image-encoded tests
**Task**: Rewrite the guidance for clarity

### 7. Add Missing Configuration Details
**Files**: Multiple strategy files
**Issue**: Missing default values and configuration options
**Tasks**:
- Add default `maxConcurrency` value for multilingual strategy
- Add configuration options for tree strategy (similar to iterative)
- Add configuration options for likert strategy
- Add configuration options for math-prompt strategy
- Document audio format specifications for audio strategy
- Document video duration and resolution configurability for video strategy

### 8. Update Retry Strategy Status
**File**: `site/docs/red-team/strategies/retry.md`
**Issue**: Line 82 mentions "Coming soon" for cloud sharing
**Task**: Update based on current feature status or remove if not planned

## Low Priority Fixes

### 9. Standardize YAML Examples
**Files**: All strategy documentation files
**Issue**: Inconsistent YAML formatting (some use quotes for IDs, others don't)
**Task**: Standardize all YAML examples to use consistent formatting

### 10. Add Error Handling Documentation
**Files**: All strategy documentation files
**Issue**: Missing information about what happens when strategies fail
**Task**: Add a common section about error handling and fallback behavior

### 11. Add Performance Considerations
**Files**: `image.md`, `audio.md`, `video.md`, `pandamonium.md`
**Issue**: No performance or resource usage warnings
**Task**: Add sections about performance implications and resource requirements

### 12. Document Cross-Strategy Interactions
**Files**: `prompt-injection.md`, `multilingual.md`
**Issue**: No information about how strategies interact when used together
**Task**: Add documentation about strategy combinations and interactions

### 13. Clarify Technical Details
**Files**: Various
**Tasks**:
- Explain Likert scale terminology in `likert.md` (binary vs traditional scales)
- Add context to success rate claims in `math-prompt.md`
- Explain deduplication logic in `retry.md`
- Document harmful plugin criteria in `prompt-injection.md`
- Add citation format variations in `citation.md`

## Implementation Notes

When fixing these issues:
1. Verify all changes against the actual implementation code
2. Test examples to ensure they produce the claimed output
3. Maintain consistent formatting and style across all files
4. Add links to related strategies where appropriate
5. Consider adding more realistic examples where current ones are too simplistic