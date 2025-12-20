# Fix Plan: Runtime Variable Filtering Bug in Test Matching

## Executive Summary

The `--filter-errors-only` and `--filter-failing` CLI flags return 0 test cases when used with multi-turn redteam strategies (GOAT, Crescendo, SIMBA) because runtime variables like `sessionId` are added during evaluation but not filtered during test matching.

## Root Cause Analysis

### Problem 1: Incomplete Runtime Variable Filtering

**Location:** `src/util/index.ts:444-450`

```typescript
function filterRuntimeVars(vars: Vars | undefined): Vars | undefined {
  if (!vars) {
    return vars;
  }
  const { _conversation, ...userVars } = vars;
  return userVars;
}
```

The function only filters `_conversation`, but multiple runtime variables are added during evaluation:
- `sessionId` - Added by GOAT, SIMBA, Crescendo providers
- Potentially others in the future

### Problem 2: Mutation of Test Object by Reference

**Location:** `src/evaluator.ts:302`

```typescript
const vars = test.vars || {};
```

This creates `vars` as a reference to `test.vars`, not a copy. When providers modify `context.vars`:
- `src/redteam/providers/goat.ts:495`: `context.vars.sessionId = targetResponse.sessionId;`
- `src/redteam/providers/simba.ts:381`: `conversation.context.vars.sessionId = targetResponse.sessionId;`

The original `test.vars` object is mutated, and this mutated object is stored in the database at `src/evaluator.ts:470`.

### Impact

1. `resultIsForTestCase()` fails to match stored results with fresh tests
2. `--filter-errors-only` and `--filter-failing` return 0 results
3. Cache lookups may fail for multi-turn evaluations
4. Test deduplication logic may be affected

## Fix Strategy

### Approach: Defense in Depth

We'll implement two fixes:
1. **Immediate fix**: Extend `filterRuntimeVars` to filter all known runtime variables
2. **Robust fix**: Create a shallow copy of `test.vars` in the evaluator to prevent mutation

Both fixes are needed because:
- The filter fix handles existing data in databases
- The copy fix prevents the problem from occurring in new evaluations

## Implementation Plan

### Step 1: Extend filterRuntimeVars Function

**File:** `src/util/index.ts`

```typescript
/**
 * Runtime variables that are added during evaluation but aren't part
 * of the original test definition. These should be filtered when
 * comparing test cases.
 */
const RUNTIME_VAR_KEYS = ['_conversation', 'sessionId'] as const;

/**
 * Filters out runtime-only variables that are added during evaluation
 * but aren't part of the original test definition
 */
function filterRuntimeVars(vars: Vars | undefined): Vars | undefined {
  if (!vars) {
    return vars;
  }
  const filtered = { ...vars };
  for (const key of RUNTIME_VAR_KEYS) {
    delete filtered[key];
  }
  return filtered;
}
```

**Rationale:** Using a constant array makes it easy to add new runtime vars in the future and documents what variables are considered "runtime only".

### Step 2: Prevent Mutation in Evaluator

**File:** `src/evaluator.ts` (around line 302)

Change from:
```typescript
const vars = test.vars || {};
```

To:
```typescript
// Create a shallow copy to prevent mutation of the original test.vars
const vars: Vars = { ...(test.vars || {}) };
```

**Rationale:** This prevents any downstream code from accidentally mutating the original test object.

### Step 3: Update Type Definitions (Optional but Recommended)

Consider adding a JSDoc comment to `CallApiContextParams` to clarify that `vars` should not be mutated:

**File:** `src/types/providers.ts`

```typescript
export interface CallApiContextParams {
  /**
   * Variables for this evaluation. Note: This is a copy - mutations
   * will not affect the original test case.
   */
  vars: Vars;
  // ... rest of interface
}
```

## Testing Plan

### Unit Tests

#### Test 1: filterRuntimeVars filters sessionId

**File:** `test/util/index.test.ts` (new or existing)

```typescript
describe('filterRuntimeVars', () => {
  it('should filter out _conversation', () => {
    const vars = { input: 'hello', _conversation: [] };
    const result = filterRuntimeVars(vars);
    expect(result).toEqual({ input: 'hello' });
    expect(result).not.toHaveProperty('_conversation');
  });

  it('should filter out sessionId', () => {
    const vars = { input: 'hello', sessionId: 'test-session-123' };
    const result = filterRuntimeVars(vars);
    expect(result).toEqual({ input: 'hello' });
    expect(result).not.toHaveProperty('sessionId');
  });

  it('should filter out multiple runtime vars', () => {
    const vars = {
      input: 'hello',
      _conversation: [],
      sessionId: 'test-session-123'
    };
    const result = filterRuntimeVars(vars);
    expect(result).toEqual({ input: 'hello' });
  });

  it('should handle undefined vars', () => {
    expect(filterRuntimeVars(undefined)).toBeUndefined();
  });

  it('should handle empty vars', () => {
    expect(filterRuntimeVars({})).toEqual({});
  });

  it('should not mutate original vars', () => {
    const vars = { input: 'hello', sessionId: 'test-123' };
    const original = { ...vars };
    filterRuntimeVars(vars);
    expect(vars).toEqual(original);
  });
});
```

#### Test 2: resultIsForTestCase matches with runtime vars

**File:** `test/util/index.test.ts`

```typescript
describe('resultIsForTestCase', () => {
  it('should match when result has sessionId but test does not', () => {
    const result = {
      vars: { input: 'hello', sessionId: 'test-session-123' },
      provider: { id: 'test-provider' },
    } as EvaluateResult;

    const testCase = {
      vars: { input: 'hello' },
    } as TestCase;

    expect(resultIsForTestCase(result, testCase)).toBe(true);
  });

  it('should match when result has _conversation but test does not', () => {
    const result = {
      vars: { input: 'hello', _conversation: [{ role: 'user', content: 'hi' }] },
      provider: { id: 'test-provider' },
    } as EvaluateResult;

    const testCase = {
      vars: { input: 'hello' },
    } as TestCase;

    expect(resultIsForTestCase(result, testCase)).toBe(true);
  });

  it('should match when both have runtime vars', () => {
    const result = {
      vars: { input: 'hello', sessionId: 'session-1', _conversation: [] },
      provider: { id: 'test-provider' },
    } as EvaluateResult;

    const testCase = {
      vars: { input: 'hello', sessionId: 'session-2', _conversation: ['different'] },
    } as TestCase;

    expect(resultIsForTestCase(result, testCase)).toBe(true);
  });
});
```

#### Test 3: Update existing filterFailingBug test

**File:** `test/commands/eval/filterFailingBug.test.ts`

Extend the existing test to cover `sessionId`:

```typescript
it('should match tests even when stored results have sessionId added', async () => {
  const mockTestSuite: TestSuite = {
    prompts: [],
    providers: [],
    tests: [
      {
        description: 'test with goat strategy',
        vars: { prompt: 'test prompt' },
        assert: [],
      },
    ],
  };

  const mockEval = {
    id: 'eval-123',
    toEvaluateSummary: vi.fn().mockResolvedValue({
      version: 2,
      results: [
        {
          vars: { prompt: 'test prompt', sessionId: 'goat-session-abc' },
          success: false,
          failureReason: ResultFailureReason.ERROR,
          testCase: {
            description: 'test with goat strategy',
            vars: { prompt: 'test prompt', sessionId: 'goat-session-abc' },
            assert: [],
          },
        },
      ],
      // ... other fields
    }),
  };

  vi.mocked(Eval.findById).mockResolvedValue(mockEval as any);

  const result = await filterTests(mockTestSuite, { errorsOnly: 'eval-123' });

  expect(result).toHaveLength(1);
  expect(result[0].description).toBe('test with goat strategy');
});
```

### Integration Tests

#### Test 4: End-to-end filter with GOAT strategy

**File:** `test/commands/eval/filterTests.integration.test.ts` (new file)

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { evaluate } from '../../../src/evaluator';
import { filterTests } from '../../../src/commands/eval/filterTests';
import Eval from '../../../src/models/eval';

describe('filterTests integration with multi-turn strategies', () => {
  let evalRecord: Eval;

  beforeEach(async () => {
    // Create a test evaluation with GOAT provider that adds sessionId
    // This would require mocking the GOAT provider or using a real one
  });

  afterEach(async () => {
    // Clean up test data
    if (evalRecord) {
      await evalRecord.delete();
    }
  });

  it('should filter error tests correctly after GOAT evaluation', async () => {
    // 1. Run evaluation with GOAT provider that produces some errors
    // 2. Use filterTests with errorsOnly flag
    // 3. Verify correct tests are returned
  });
});
```

### Manual Testing Checklist

#### Scenario 1: Basic Filter Test

```bash
# 1. Create a simple redteam config with GOAT strategy
cat > /tmp/test-redteam.yaml << 'EOF'
description: Test filter-errors-only
targets:
  - id: echo
    config:
      response: "This is a test response"
redteam:
  numTests: 5
  purpose: Test application
  plugins:
    - harmful:violent-crime
  strategies:
    - goat
EOF

# 2. Run the evaluation (some tests may error if no real target)
npm run local -- redteam eval -c /tmp/test-redteam.yaml --no-cache

# 3. Note the eval ID from output, then try filter
npm run local -- redteam eval -c /tmp/test-redteam.yaml \
  --filter-errors-only '<eval-id>' --no-cache

# 4. Verify it returns the correct number of tests (not 0)
```

#### Scenario 2: Retry Command Verification

```bash
# 1. Run an evaluation that produces errors
# 2. Use retry command
npm run local -- retry '<eval-id>'

# 3. Verify retry works and results update
# 4. Check UI reflects changes (may need page refresh)
```

#### Scenario 3: Filter with Multiple Runtime Vars

```bash
# 1. Create config that uses _conversation AND sessionId
# 2. Run evaluation
# 3. Filter with --filter-failing
# 4. Verify correct matching
```

### Regression Tests

Ensure existing functionality isn't broken:

```bash
# Run all existing filter tests
npx vitest run test/commands/eval/filterTests.test.ts
npx vitest run test/commands/eval/filterFailingBug.test.ts

# Run evaluator tests
npx vitest run test/evaluator.test.ts

# Run redteam provider tests
npx vitest run test/redteam/providers/goat.test.ts
npx vitest run test/redteam/providers/simba.test.ts
npx vitest run test/redteam/providers/crescendo

# Run full test suite
npm test
```

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/util/index.ts` | Modify | Extend `filterRuntimeVars` to filter `sessionId` |
| `src/evaluator.ts` | Modify | Create shallow copy of `test.vars` |
| `test/util/index.test.ts` | Add/Modify | Add tests for `filterRuntimeVars` |
| `test/commands/eval/filterFailingBug.test.ts` | Modify | Add `sessionId` test case |
| `test/commands/eval/filterTests.integration.test.ts` | Add | Integration tests (optional) |

## Rollout Plan

1. **Phase 1: Implement fixes**
   - Update `filterRuntimeVars` function
   - Update evaluator to create copy of vars
   - Add unit tests

2. **Phase 2: Test locally**
   - Run all unit tests
   - Manual testing with redteam configs
   - Verify retry command still works

3. **Phase 3: Create PR**
   - Follow PR conventions from `docs/agents/pr-conventions.md`
   - Title: `fix(redteam): filter sessionId in test matching for multi-turn strategies`

4. **Phase 4: Post-merge verification**
   - Test with customer's exact scenario if possible
   - Monitor for any regressions

## Edge Cases to Consider

1. **User-defined sessionId**: If a user explicitly sets `sessionId` in their test vars, it should still match. The fix handles this because we filter from both sides of the comparison.

2. **Future runtime vars**: The `RUNTIME_VAR_KEYS` constant makes it easy to add new vars without changing logic.

3. **Existing database entries**: The fix is backwards compatible - it will correctly match old results that have `sessionId` against new configs that don't.

4. **Non-string sessionId**: Some tests show `sessionId` can be numbers or objects (stringified). The filter removes it regardless of type.

## Success Criteria

1. `--filter-errors-only` returns correct tests when used with GOAT/Crescendo/SIMBA evaluations
2. `--filter-failing` returns correct tests when runtime vars are present
3. `retry` command continues to work correctly
4. All existing tests pass
5. No regression in cache behavior or test deduplication

## Notes for Customer Response

After implementing this fix, the customer should:

1. Update to the latest version of promptfoo
2. The `--filter-errors-only` and `--filter-failing` flags should work correctly
3. If issues persist, they should verify:
   - The config file matches what was used in the original evaluation
   - The eval ID is correct
   - The target is accessible and responding
