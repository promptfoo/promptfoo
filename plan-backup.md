# Issue #6200 – LLM Rubric Script Output Fix Plan

## Executive Summary

When using file-based scripts (JavaScript, Python, Ruby) as assertion values via `file://` references, the script output is correctly executed and logged but not used as the actual assertion value. Instead, the literal `file://...` path string is passed to the assertion handler.

**Solution:** Centralized fix in `src/assertions/index.ts` that updates `renderedValue` with script output for all non-script assertion types.

**Estimated Effort:** 6-8 hours (including tests and documentation)

---

## 1. Reproduction

Create a minimal rubric script and verify the bug:

```bash
mkdir -p tmp && cat <<'EOF' > tmp/rubric.js
module.exports.rubric = () => 'script says abc';
EOF
```

Run `runAssertion` with monkey-patched matcher to inspect what gets sent:

```bash
node <<'NODE'
const cliState = require('./dist/src/cliState.js').default;
cliState.basePath = process.cwd();
const { runAssertion } = require('./dist/src/assertions/index.js');
const matchers = require('./dist/src/matchers.js');
const originalMatches = matchers.matchesLlmRubric;
matchers.matchesLlmRubric = async (...args) => {
  console.log('matchesLlmRubric rubric param:', args[0]);
  return { pass: true, score: 1, reason: 'stub' };
};
(async () => {
  await runAssertion({
    assertion: { type: 'llm-rubric', value: 'file://tmp/rubric.js:rubric' },
    test: { vars: {}, options: { grading: { provider: { id: 'promptfoo:echo' } } } },
    providerResponse: { output: 'demo', raw: 'demo', cost: 0, cached: false, tokenUsage: { total: 0, prompt: 0, completion: 0 } },
  });
  matchers.matchesLlmRubric = originalMatches;
})();
NODE
```

**Expected:** `matchesLlmRubric rubric param: script says abc`
**Actual (bug):** `matchesLlmRubric rubric param: file://tmp/rubric.js:rubric`

Clean up: `rm -rf tmp/`

---

## 2. Root Cause Analysis

### Scope: Supported Script Languages in Assertions

**Assertion values (`file://` references) currently support:**

- JavaScript (`.js`, `.mjs`, `.cjs`, `.ts`, `.mts`, `.cts`)
- Python (`.py`)
- Ruby (`.rb`)

**NOT supported in assertion values:**

- Go (`.go`) - Only supported as providers via `golang:` prefix
- `exec:` prefix - Only supported for prompts, not assertion values
- Other executables (`.sh`, `.bash`, etc.) - Only for prompts

If users want Go or exec: support in assertion values, that's a separate feature request (not in scope for this fix).

### The Problem

In `src/assertions/index.ts:273-343`:

1. `renderedValue` is initialized as `assertion.value` (e.g., `"file://index.js:rubric"`)
2. For `file://` script references:
   - JavaScript/Python/Ruby scripts are executed
   - Output is stored in `valueFromScript`
   - **BUG:** `renderedValue` is NOT updated with the script output
3. Both `renderedValue` (still `"file://..."`) and `valueFromScript` are passed to handlers
4. Most handlers only use `renderedValue`, ignoring `valueFromScript`

### Code Location

```typescript
// src/assertions/index.ts:290-328
if (isJavascriptFile(filePath)) {
  valueFromScript = await loadFromJavaScriptFile(filePath, functionName, [output, context]);
  logger.debug(`Javascript script ${filePath} output: ${valueFromScript}`);
  // BUG: renderedValue is NOT updated!
} else if (filePath.endsWith('.py')) {
  valueFromScript = pythonScriptOutput;
  // BUG: renderedValue is NOT updated!
} else if (filePath.endsWith('.rb')) {
  valueFromScript = rubyScriptOutput;
  // BUG: renderedValue is NOT updated!
} else {
  renderedValue = processFileReference(renderedValue); // Only non-scripts update renderedValue
}
```

### Complete Consumer Audit

**CRITICAL:** Every module that reads `renderedValue` must be validated before implementing the centralized fix.

**Total files using `renderedValue`: 55**

#### Category 1: Assertion Handlers (27 files)

| Handler                     | File                        | Expected Type                 | Centralized Fix Impact       | Status       |
| --------------------------- | --------------------------- | ----------------------------- | ---------------------------- | ------------ |
| `handleLlmRubric`           | llmRubric.ts:6-35           | string \| object \| undefined | Will receive script output   | ✅ Safe      |
| `handleModelGradedClosedQa` | modelGradedClosedQa.ts:6-33 | string                        | Will receive script output   | ✅ Safe      |
| `handleFactuality`          | factuality.ts:6-33          | string                        | Will receive script output   | ✅ Safe      |
| `handleGEval`               | geval.ts:6-61               | string \| string[]            | Will receive script output   | ✅ Safe      |
| `handleContextRecall`       | contextRecall.ts:17-52      | string                        | Will receive script output   | ✅ Safe      |
| `handleSimilar`             | similar.ts:6-78             | string \| string[]            | Will receive script output   | ✅ Safe      |
| `handleRegex`               | regex.ts:5-33               | string                        | Will receive script output   | ✅ Safe      |
| `handleStartsWith`          | startsWith.ts:5-25          | string                        | Will receive script output   | ✅ Safe      |
| `handleEquals`              | equals.ts:5-34              | string \| object              | Will receive script output   | ✅ Safe      |
| `handleLevenshtein`         | levenshtein.ts:6-26         | string                        | Will receive script output   | ✅ Safe      |
| `handleBleuScore`           | bleu.ts:122-150             | string \| string[]            | Will receive script output   | ✅ Safe      |
| `handleGleuScore`           | gleu.ts:148-174             | string \| string[]            | Will receive script output   | ✅ Safe      |
| `handleRougeScore`          | rouge.ts:9-19               | string                        | Will receive script output   | ✅ Safe      |
| `handleWebhook`             | webhook.ts:7-67             | string (URL)                  | Will receive script output   | ✅ Safe      |
| `handlePiScorer`            | pi.ts:6-15                  | string                        | Will receive script output   | ✅ Safe      |
| `handleClassifier`          | classifier.ts:6-34          | string \| undefined           | Will receive script output   | ✅ Safe      |
| `handleFinishReason`        | finishReason.ts:5-35        | string                        | Has own fallback             | ✅ Safe      |
| `handleIsXml`               | xml.ts:71-107               | string \| string[] \| object  | Will receive script output   | ✅ Safe      |
| `handleMeteor`              | meteor.ts                   | string                        | Will receive script output   | ✅ Safe      |
| `handleIsJson`              | json.ts                     | various                       | Will receive script output   | ✅ Safe      |
| `handleIsSql`               | sql.ts                      | string                        | Will receive script output   | ✅ Safe      |
| `handleJavascript`          | javascript.ts:19-102        | string (code)                 | **Excluded via safeguard**   | ✅ Excluded  |
| `handlePython`              | python.ts:40-157            | string (code)                 | **Excluded via safeguard**   | ✅ Excluded  |
| `handleRuby`                | ruby.ts:40-114              | string (code)                 | **Excluded via safeguard**   | ✅ Excluded  |
| `handleContains` (all 6)    | contains.ts                 | string \| number              | Already uses valueFromScript | ✅ Reference |

#### Category 2: Redteam Plugins (26 files) - **CRITICAL REVIEW NEEDED**

Redteam plugins receive `renderedValue` in `getSuggestions()` and `getResult()` methods:

```typescript
// src/redteam/plugins/base.ts:435-438
...(typeof renderedValue === 'object' && renderedValue !== null ? renderedValue : {}),
value: renderedValue,
```

| Plugin                    | File                       | Expected Type   | Uses file:// scripts? | Status    |
| ------------------------- | -------------------------- | --------------- | --------------------- | --------- |
| `intent`                  | intent.ts                  | object (config) | **Unlikely**          | ⚠️ Verify |
| `policy`                  | policy/index.ts            | object (config) | **Unlikely**          | ⚠️ Verify |
| `harmful`                 | harmful/graders.ts         | object (config) | **Unlikely**          | ⚠️ Verify |
| `aegis`                   | aegis.ts                   | object (config) | **Unlikely**          | ⚠️ Verify |
| `beavertails`             | beavertails.ts             | object (config) | **Unlikely**          | ⚠️ Verify |
| `indirectPromptInjection` | indirectPromptInjection.ts | **string**      | **Unlikely**          | ⚠️ Verify |
| (20 more plugins)         | various                    | object/string   | **Unlikely**          | ⚠️ Verify |

**Key Question:** Do redteam assertions ever use `file://` scripts for their values?

**Analysis:** Redteam plugins use `renderedValue` for configuration objects like `categoryGuidance`, `pluginConfig`, etc. These are typically defined inline in YAML configs, NOT loaded from file:// scripts.

**Verification Required:**

1. Search test fixtures for redteam assertions with `file://` values
2. Run redteam integration tests after prototype implementation
3. If any redteam plugin uses file:// scripts, ensure type compatibility

#### Category 3: Core Infrastructure (2 files)

| File                      | Usage                                               | Impact                     |
| ------------------------- | --------------------------------------------------- | -------------------------- |
| `src/types/index.ts:607`  | Type definition for `AssertionParams.renderedValue` | No runtime impact          |
| `src/matchers.ts:726,738` | Used in `matchesClosedQa` for question parameter    | Will receive script output |

#### Category 4: Metadata Storage

**IMPORTANT:** `renderedValue` is stored in `result.metadata.renderedAssertionValue`:

```typescript
// src/assertions/index.ts:396-401
if (
  renderedValue !== undefined &&
  renderedValue !== assertion.value &&
  typeof renderedValue === 'string'
) {
  result.metadata = result.metadata || {};
  result.metadata.renderedAssertionValue = renderedValue;
}
```

**Current Behavior:** Stores `renderedValue` if it differs from `assertion.value` (e.g., after nunjucks templating)
**After Fix:** Will store script output instead of file path

**Decision Required:**

- Option A: Store both (file path + output) - More debugging info, but complex
- Option B: Store only output - Cleaner, shows what was actually used
- **Recommendation:** Option B - The output is what matters for evaluation

**Key Findings:**

- **55 total files** use `renderedValue` - must verify all
- **Redteam plugins** need special attention - they spread `renderedValue` properties
- **Metadata storage** will change from file path to script output
- **No handlers** appear to rely on seeing the literal file path for functionality

### Type Handling Matrix

Scripts may return different types. Here's how each handler will respond:

| Handler                     | String | Number | Boolean | Object | Array        | Error Behavior   |
| --------------------------- | ------ | ------ | ------- | ------ | ------------ | ---------------- |
| `handleLlmRubric`           | ✅     | ❌     | ❌      | ✅     | ❌           | Invariant throws |
| `handleModelGradedClosedQa` | ✅     | ❌     | ❌      | ❌     | ❌           | Invariant throws |
| `handleFactuality`          | ✅     | ❌     | ❌      | ❌     | ❌           | Invariant throws |
| `handleGEval`               | ✅     | ❌     | ❌      | ❌     | ✅ (strings) | Invariant throws |
| `handleContextRecall`       | ✅     | ❌     | ❌      | ❌     | ❌           | Invariant throws |
| `handleSimilar`             | ✅     | ❌     | ❌      | ❌     | ✅ (strings) | Invariant throws |
| `handleRegex`               | ✅     | ❌     | ❌      | ❌     | ❌           | Invariant throws |
| `handleStartsWith`          | ✅     | ❌     | ❌      | ❌     | ❌           | Invariant throws |
| `handleEquals`              | ✅     | ❌     | ❌      | ✅     | ❌           | JSON.parse fails |
| `handleLevenshtein`         | ✅     | ❌     | ❌      | ❌     | ❌           | Invariant throws |
| `handleBleuScore`           | ✅     | ❌     | ❌      | ❌     | ✅ (strings) | Invariant throws |
| `handleGleuScore`           | ✅     | ❌     | ❌      | ❌     | ✅ (strings) | Invariant throws |
| `handleRougeScore`          | ✅     | ❌     | ❌      | ❌     | ❌           | Invariant throws |
| `handleWebhook`             | ✅     | ❌     | ❌      | ❌     | ❌           | Invariant throws |
| `handlePiScorer`            | ✅     | ❌     | ❌      | ❌     | ❌           | Invariant throws |
| `handleClassifier`          | ✅     | ❌     | ❌      | ❌     | ❌           | Invariant throws |
| `handleContains`            | ✅     | ✅     | ❌      | ❌     | ❌           | Invariant throws |

**Type Mismatch Behavior:**

- Handlers validate type via `invariant()` which throws descriptive errors
- Users will see clear error messages like: `"regex" assertion type must have a string value`
- **No silent failures** - type mismatches are caught at handler level
- **Documentation must specify allowed return types per assertion**

### Type Validation Rules

**Where validation occurs:**

- **NOT in runAssertion** - The centralized fix does NOT validate types
- **IN handlers** - Each handler validates via `invariant()` and throws descriptive errors
- **Rationale:** Handlers know what types they accept; centralizing would duplicate logic

**Validation flow:**

```
Script returns value → runAssertion sets renderedValue → Handler validates type → Error or success
```

**Specific behaviors:**

| Script Returns | Handler Expects       | Result                                                                    |
| -------------- | --------------------- | ------------------------------------------------------------------------- |
| `string`       | `string`              | ✅ Pass to handler                                                        |
| `number`       | `string`              | ❌ Handler invariant throws                                               |
| `object`       | `string`              | ❌ Handler invariant throws                                               |
| `object`       | `object` (llm-rubric) | ✅ Pass to handler                                                        |
| `null`         | `string`              | ❌ Handler invariant throws                                               |
| `undefined`    | any                   | Uses fallback (empty string for most)                                     |
| `function`     | any                   | ❌ runAssertion throws (only javascript/python/ruby can return functions) |

**Error message examples:**

```
// Script returns number for regex assertion
Invariant failed: "regex" assertion type must have a string value

// Script returns function for equals assertion
Script for "equals" assertion returned a function. Only javascript/python/ruby assertion types can return functions.

// Script returns object for levenshtein assertion
Invariant failed: "levenshtein" assertion type must have a string value
```

### Edge Case Handling

#### 1. Script Returns `undefined`

**Behavior:** Treated as no script output; falls through to empty string fallback in handlers

```typescript
if (valueFromScript !== undefined && !SCRIPT_RESULT_ASSERTIONS.has(baseType)) {
  renderedValue = valueFromScript; // Only sets if NOT undefined
}
```

**User impact:** Handler receives empty string or original `renderedValue`

#### 2. Script Returns `null`

**Behavior:** `null` IS passed to handler (it's not `undefined`)

```typescript
valueFromScript = null; // typeof null === 'object'
renderedValue = null; // Handler receives null
```

**User impact:** Most handlers will fail with invariant error. Users should return empty string instead.

**Documentation note:** "Scripts should return empty string `''` instead of `null` for empty values."

#### 3. Script Throws Error

**Behavior:** Already handled in existing code - returns failed assertion result

```typescript
} catch (error) {
  return {
    pass: false,
    score: 0,
    reason: (error as Error).message,
    assertion,
  };
}
```

**User impact:** Assertion fails with script error message in reason

#### 4. `npm:` Package Paths

**Current behavior:** Package paths are handled separately from `file://` scripts

```typescript
} else if (isPackagePath(renderedValue)) {
  // Package path handling - NOT modified by this fix
}
```

**User impact:** No change - packages continue to work as before

#### 5. Function Name Not Found

**Behavior:** Script execution throws error, caught by existing handler

**User impact:** Assertion fails with error like "Function 'missing' not found in script.js"

#### 6. Empty Script Output

**Behavior:** Empty string is valid and passed to handler

**User impact:** Handler receives `''` - most will fail unless expecting empty string

---

## 3. Solution: Centralized Fix

### Approach

Update `renderedValue` with script output in `src/assertions/index.ts` right after script execution, except for assertion types that interpret `renderedValue` as executable code.

### Why Centralized (vs Handler-Level Fix)

| Aspect           | Centralized        | Handler-Level              |
| ---------------- | ------------------ | -------------------------- |
| Files to modify  | 1                  | 11+                        |
| Future handlers  | Auto-fixed         | Must remember pattern      |
| Metadata display | Shows actual value | Shows file path            |
| Risk             | Lower              | Higher (may miss handlers) |

### Implementation

**Location:** `src/assertions/index.ts` after line 342 (after script execution block)

```typescript
// Add after line 342, before constructing assertionParams

// Script assertion types interpret renderedValue as code to execute
// All other types should use the script output as the comparison value
const SCRIPT_RESULT_ASSERTIONS = new Set(['javascript', 'python', 'ruby']);
const baseType = getAssertionBaseType(assertion);

if (valueFromScript !== undefined && !SCRIPT_RESULT_ASSERTIONS.has(baseType)) {
  // Validate the script result type
  const resultType = typeof valueFromScript;
  if (resultType === 'function') {
    throw new Error(
      `Script for "${assertion.type}" assertion returned a function. ` +
        `Only javascript/python/ruby assertion types can return functions. ` +
        `For other assertion types, return the expected value (string, number, boolean, or object).`,
    );
  }

  // Update renderedValue with the script output
  renderedValue = valueFromScript;
}
```

### Full Context (src/assertions/index.ts:326-365)

```typescript
      } else if (filePath.endsWith('.rb')) {
        try {
          const { runRuby } = await import('../ruby/rubyUtils');
          const rubyScriptOutput = await runRuby(filePath, functionName || 'get_assert', [
            output,
            context,
          ]);
          valueFromScript = rubyScriptOutput;
          logger.debug(`Ruby script ${filePath} output: ${valueFromScript}`);
        } catch (error) {
          return {
            pass: false,
            score: 0,
            reason: (error as Error).message,
            assertion,
          };
        }
      } else {
        renderedValue = processFileReference(renderedValue);
      }
    } else if (isPackagePath(renderedValue)) {
      // ... existing package path handling ...
    } else {
      // It's a normal string value
      renderedValue = nunjucks.renderString(renderedValue, test.vars || {});
    }
  } else if (renderedValue && Array.isArray(renderedValue)) {
    // ... existing array handling ...
  }

  // === NEW CODE: Centralized script output resolution ===
  const SCRIPT_RESULT_ASSERTIONS = new Set(['javascript', 'python', 'ruby']);
  const baseType = getAssertionBaseType(assertion);

  if (valueFromScript !== undefined && !SCRIPT_RESULT_ASSERTIONS.has(baseType)) {
    const resultType = typeof valueFromScript;
    if (resultType === 'function') {
      throw new Error(
        `Script for "${assertion.type}" assertion returned a function. ` +
        `Only javascript/python/ruby assertion types can return functions. ` +
        `For other assertion types, return the expected value (string, number, boolean, or object).`
      );
    }
    renderedValue = valueFromScript;
  }
  // === END NEW CODE ===

  // Construct CallApiContextParams for model-graded assertions...
  const providerCallContext: CallApiContextParams | undefined = provider
    ? {
        // ...
      }
    : undefined;
```

### Benefits

1. **Single point of fix** - Only modify `src/assertions/index.ts`
2. **Automatically fixes all handlers** - No need to touch 11+ files
3. **Future-proof** - New handlers automatically work correctly
4. **Better UI display** - `metadata.renderedAssertionValue` shows actual value
5. **Backward compatible** - `javascript`/`python`/`ruby` handlers unchanged
6. **Clear error message** - If script returns wrong type, user gets guidance

---

## 4. Testing Strategy

### 4.1 Unit Tests

**New test file:** `test/assertions/scriptValueResolution.test.ts`

```typescript
import { runAssertion } from '../../src/assertions/index';
import * as matchers from '../../src/matchers';
import cliState from '../../src/cliState';

jest.mock('../../src/matchers');

describe('Script value resolution', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    cliState.basePath = process.cwd();
  });

  const baseProviderResponse = {
    output: 'test output',
    raw: 'test output',
    cost: 0,
    cached: false,
    tokenUsage: { total: 0, prompt: 0, completion: 0 },
  };

  describe('llm-rubric with file:// script', () => {
    it('should pass script output to matchesLlmRubric', async () => {
      const mockMatchesLlmRubric = jest.mocked(matchers.matchesLlmRubric);
      mockMatchesLlmRubric.mockResolvedValue({ pass: true, score: 1, reason: 'ok' });

      // Create test fixture
      // ... setup file://tmp/rubric.js that returns 'dynamic rubric text'

      await runAssertion({
        assertion: { type: 'llm-rubric', value: 'file://tmp/rubric.js:rubric' },
        test: { vars: {}, options: { provider: { id: 'echo' } } },
        providerResponse: baseProviderResponse,
      });

      expect(mockMatchesLlmRubric).toHaveBeenCalledWith(
        'dynamic rubric text', // NOT 'file://tmp/rubric.js:rubric'
        expect.any(String),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        undefined,
        expect.anything(),
      );
    });

    it('should fall back to direct value when no script', async () => {
      const mockMatchesLlmRubric = jest.mocked(matchers.matchesLlmRubric);
      mockMatchesLlmRubric.mockResolvedValue({ pass: true, score: 1, reason: 'ok' });

      await runAssertion({
        assertion: { type: 'llm-rubric', value: 'direct rubric text' },
        test: { vars: {}, options: { provider: { id: 'echo' } } },
        providerResponse: baseProviderResponse,
      });

      expect(mockMatchesLlmRubric).toHaveBeenCalledWith(
        'direct rubric text',
        expect.any(String),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        undefined,
        expect.anything(),
      );
    });
  });

  describe('javascript/python/ruby assertions - REGRESSION TESTS', () => {
    it('should NOT override renderedValue for javascript type', async () => {
      // CRITICAL: Ensure javascript assertion still interprets renderedValue as code
      // Create file://script.js that returns a GradingResult
      // The assertion should execute the code in renderedValue, not treat valueFromScript as input
      // Setup: Create script that returns { pass: true, score: 1, reason: 'from script' }
      // Assert: Result matches script return, NOT comparison against valueFromScript
    });

    it('should NOT override renderedValue for python type', async () => {
      // CRITICAL: Ensure python assertion still interprets renderedValue as code
      // Create file://script.py that returns a boolean
      // The assertion should execute the code, not compare against valueFromScript
    });

    it('should NOT override renderedValue for ruby type', async () => {
      // CRITICAL: Ensure ruby assertion still interprets renderedValue as code
      // Create file://script.rb that returns a boolean
      // The assertion should execute the code, not compare against valueFromScript
    });

    it('should use valueFromScript as result for javascript assertion', async () => {
      // Verify javascript assertion uses valueFromScript as the assertion result
      // NOT as the comparison value like other assertions
    });
  });

  describe('error handling', () => {
    it('should throw descriptive error if script returns function', async () => {
      // Create script that returns () => 'value'
      // Verify error message:
      // "Script for "equals" assertion returned a function. Only javascript/python/ruby..."
    });

    it('should handle script returning null gracefully', async () => {
      // Some assertions may not accept null
      // Verify clear error message from handler invariant
    });

    it('should handle script returning object for string-only assertion', async () => {
      // e.g., regex expects string but script returns { pattern: '...' }
      // Verify invariant throws with clear message
    });
  });

  describe('edge cases', () => {
    it('should pass undefined through as-is (no override)', async () => {
      // Script returns undefined
      // renderedValue should NOT be updated
      // Handler receives original renderedValue or empty string fallback
    });

    it('should pass null to handler (not treated as undefined)', async () => {
      // Script returns null
      // renderedValue = null
      // Handler should throw invariant error for string-expecting assertions
    });

    it('should handle empty string return value', async () => {
      // Script returns ''
      // This is valid - should be passed to handler
    });

    it('should handle array return for array-accepting assertions', async () => {
      // Script returns ['ref1', 'ref2'] for bleu/gleu
      // Should pass array to handler
    });

    it('should handle object return for llm-rubric', async () => {
      // Script returns { role: 'system', content: 'test' }
      // llm-rubric accepts objects
    });

    it('should handle number return for contains assertion', async () => {
      // Script returns 42
      // contains accepts numbers
      const mockMatchesContains = jest.mocked(matchers.matchesContains);
      mockMatchesContains.mockReturnValue({ pass: true, score: 1, reason: 'ok' });

      // ... test implementation
    });

    it('should preserve npm: package path handling', async () => {
      // npm:package-name paths should NOT be affected by this fix
      // They go through separate isPackagePath handling
    });
  });
});

// Additional regression test file: test/assertions/scriptAssertionRegression.test.ts
describe('Script assertion type regression tests', () => {
  // These tests ensure javascript/python/ruby assertions continue to work
  // after the centralized fix is implemented

  describe('javascript assertion with file:// script', () => {
    it('should execute script and use return value as result', async () => {
      // file://validator.js returns { pass: true, score: 0.9, reason: 'validated' }
      // Assert: result.pass === true, result.score === 0.9
      // NOT: comparing output against script return value
    });

    it('should still work with inline code in value', async () => {
      // value: "output.includes('expected')"
      // Assert: This continues to work as before
    });
  });

  describe('python assertion with file:// script', () => {
    it('should execute script and use return value as result', async () => {
      // file://validator.py:check returns True/False
      // Assert: result.pass matches script return
    });
  });

  describe('ruby assertion with file:// script', () => {
    it('should execute script and use return value as result', async () => {
      // file://validator.rb:check returns true/false
      // Assert: result.pass matches script return
    });
  });
});
```

**Existing test updates:**

- `test/assertions/llmRubric.test.ts` - Add `valueFromScript` cases
- `test/assertions/contains.test.ts` - Verify still works (reference implementation)

### 4.2 Integration Tests

**Key Principle:** Use deterministic assertions that verify actual behavior, NOT log inspection.

**New fixture:** `test/fixtures/file-script-assertions/`

```javascript
// rubric-generator.js
module.exports.rubric = (output, context) => {
  return `Check that the output correctly addresses: ${context.vars.topic}`;
};

module.exports.expectedValue = () => 'expected string';

// For deterministic testing - script returns a known value
module.exports.knownValue = () => 'SCRIPT_OUTPUT_12345';
```

```python
# rubric-generator.py
def rubric(output, context):
    return f"Verify the response covers: {context['vars']['topic']}"

def expected_value(output, context):
    return "expected string"

# For deterministic testing
def known_value(output, context):
    return "SCRIPT_OUTPUT_12345"
```

```ruby
# rubric-generator.rb
def rubric(output, context)
  "Ensure the answer includes: #{context['vars']['topic']}"
end

# For deterministic testing
def known_value(output, context)
  "SCRIPT_OUTPUT_12345"
end
```

**Test config:** `test/fixtures/file-script-assertions/promptfooconfig.yaml`

```yaml
providers:
  - id: echo

tests:
  - vars:
      topic: 'machine learning basics'
    assert:
      - type: llm-rubric
        value: file://rubric-generator.js:rubric
        provider: echo
      - type: contains
        value: file://rubric-generator.js:expectedValue
      - type: equals
        value: file://rubric-generator.py:expected_value
```

#### Deterministic Integration Test Strategy

**Problem:** Can't verify `llm-rubric` script output without making actual LLM calls.

**Solution:** Use assertions that have deterministic pass/fail behavior based on script output.

```yaml
# test/fixtures/file-script-assertions/deterministic-tests.yaml
providers:
  - id: echo # Returns prompt as output

tests:
  # Test 1: equals assertion with script value
  - description: 'Script output used for equals comparison'
    vars: {}
    assert:
      - type: equals
        value: file://rubric-generator.js:knownValue
    # Echo provider returns the prompt, so this tests whether script output is used
    # If script output "SCRIPT_OUTPUT_12345" is used → fails (prompt != script value)
    # If file path is used → fails (prompt != "file://...")
    # We can then verify the failure message contains the script output

  # Test 2: contains assertion with script value
  - description: 'Script output contains expected substring'
    vars: {}
    prompt: 'The answer is SCRIPT_OUTPUT_12345'
    assert:
      - type: contains
        value: file://rubric-generator.js:knownValue
    # If script output is used → passes
    # If file path is used → fails

  # Test 3: regex assertion with script pattern
  - description: 'Script generates regex pattern'
    vars:
      pattern: "\\d{5}"
    prompt: 'Code: 12345'
    assert:
      - type: regex
        value: file://pattern-generator.js:getPattern
    # Script returns "\d{5}", matches "12345" → passes
    # If file path is used → fails (not a valid regex)
```

**Verification approach:**

```typescript
// test/integration/scriptValueResolution.test.ts
describe('Script value resolution integration', () => {
  it('should use script output for contains assertion', async () => {
    const result = await evaluate({
      providers: [{ id: 'echo' }],
      prompts: ['The answer is SCRIPT_OUTPUT_12345'],
      tests: [
        {
          assert: [
            {
              type: 'contains',
              value: 'file://fixtures/rubric-generator.js:knownValue',
            },
          ],
        },
      ],
    });

    // If script output is used, contains passes
    // If file path is used, contains fails
    expect(result.results[0].success).toBe(true);
  });

  it('should use script output for regex assertion', async () => {
    const result = await evaluate({
      providers: [{ id: 'echo' }],
      prompts: ['Code: 12345'],
      tests: [
        {
          assert: [
            {
              type: 'regex',
              value: 'file://fixtures/pattern-generator.js:getPattern', // returns "\\d{5}"
            },
          ],
        },
      ],
    });

    expect(result.results[0].success).toBe(true);
  });

  it('should show script output in failure message', async () => {
    const result = await evaluate({
      providers: [{ id: 'echo' }],
      prompts: ['wrong output'],
      tests: [
        {
          assert: [
            {
              type: 'equals',
              value: 'file://fixtures/rubric-generator.js:knownValue',
            },
          ],
        },
      ],
    });

    // Failure message should contain "SCRIPT_OUTPUT_12345" not "file://..."
    expect(result.results[0].success).toBe(false);
    const failureReason = result.results[0].gradingResult?.reason || '';
    expect(failureReason).toContain('SCRIPT_OUTPUT_12345');
    expect(failureReason).not.toContain('file://');
  });
});
```

### 4.3 Mock-Based QA Methodology

**IMPORTANT:** Use mocks to capture matcher inputs, not log inspection.

```typescript
// Example: Verifying matchesLlmRubric receives correct rubric
import * as matchers from '../../src/matchers';

jest.mock('../../src/matchers');

it('should pass script output to matchesLlmRubric', async () => {
  const mockMatchesLlmRubric = jest.mocked(matchers.matchesLlmRubric);
  mockMatchesLlmRubric.mockResolvedValue({ pass: true, score: 1, reason: 'ok' });

  await runAssertion({
    assertion: { type: 'llm-rubric', value: 'file://rubric.js:generate' },
    // ...
  });

  // Assert on captured arguments - NOT log inspection
  expect(mockMatchesLlmRubric).toHaveBeenCalledWith(
    'actual rubric from script', // First arg is the rubric
    expect.any(String), // outputString
    expect.anything(), // options
    expect.anything(), // vars
    expect.anything(), // assertion
    undefined, // options
    expect.anything(), // providerCallContext
  );
});
```

**QA Validation Approaches:**

1. **Unit tests with mocks** - Capture matcher/handler inputs
2. **Integration tests with echo provider** - Verify end-to-end without API calls
3. **Custom test provider** - Log requests for inspection
4. **Snapshot tests** - Compare assertion params before/after fix

### 4.4 Test Commands

```bash
# Unit tests
npm test -- test/assertions/scriptValueResolution.test.ts --coverage --randomize
npm test -- test/assertions/scriptAssertionRegression.test.ts --coverage --randomize
npm test -- test/assertions/llmRubric.test.ts --coverage --randomize
npm test -- test/assertions/index.test.ts --coverage --randomize

# Integration tests
npm run test:integration

# Full regression - CRITICAL before merging
npm test -- --coverage --randomize

# Manual verification
npm run local -- eval -c test/fixtures/file-script-assertions/promptfooconfig.yaml
```

### 4.5 Pre-Implementation Prototype Validation

**Before implementing**, run a prototype to validate no hidden dependencies:

1. Create branch with centralized fix only (no tests)
2. Run full test suite: `npm test -- --coverage --randomize`
3. Document any unexpected failures
4. Investigate each failure for hidden `renderedValue` dependencies
5. Only proceed if all tests pass or failures are understood

---

## 5. QA Checklist

### Pre-Implementation

- [ ] Run reproduction script and confirm bug exists
- [ ] Document current test coverage for assertion handlers
- [ ] Create test fixture scripts (JS/Python/Ruby)
- [ ] **CRITICAL: Prototype validation** - Implement fix, run full test suite, document any failures

### Implementation

- [ ] Add centralized fix to `src/assertions/index.ts`
- [ ] Add `SCRIPT_RESULT_ASSERTIONS` constant
- [ ] Add type validation with descriptive error
- [ ] Run linter: `npm run lint`
- [ ] Run formatter: `npm run format`
- [ ] Run TypeScript check: `npm run tsc`

### Testing

- [ ] Add unit tests for centralized resolution
- [ ] Add integration tests with JS/Python/Ruby fixtures
- [ ] Test `llm-rubric` with file:// script
- [ ] Test `model-graded-closedqa` with file:// script
- [ ] Test `factuality` with file:// script
- [ ] Test `equals` with file:// script
- [ ] Test `contains` still works (no regression)
- [ ] **REGRESSION: `javascript` assertion with file:// still uses valueFromScript as result**
- [ ] **REGRESSION: `python` assertion with file:// still uses valueFromScript as result**
- [ ] **REGRESSION: `ruby` assertion with file:// still uses valueFromScript as result**
- [ ] **REGRESSION: `javascript` with inline code still works**
- [ ] Test fallback when no script (direct value)
- [ ] Test error when script returns function for non-script type
- [ ] Test type mismatch errors (e.g., object to regex)
- [ ] **Edge cases:**
  - [ ] Script returns `undefined` (should NOT override renderedValue)
  - [ ] Script returns `null` (should pass to handler, handler throws)
  - [ ] Script returns empty string `''` (valid, passes through)
  - [ ] Script returns array for array-accepting assertions (bleu/gleu)
  - [ ] Script returns object for llm-rubric
  - [ ] Script returns number for contains
  - [ ] `npm:` package paths unaffected by fix
- [ ] Use mock-based assertions to capture matcher inputs
- [ ] **Integration tests with deterministic assertions:**
  - [ ] contains assertion with known script output
  - [ ] regex assertion with script-generated pattern
  - [ ] equals assertion verifies failure message contains script output
- [ ] Run full test suite: `npm test -- --coverage --randomize`

### Documentation

- [ ] Update `site/docs/configuration/assertions.md`
- [ ] Add changelog entry to `CHANGELOG.md`
- [ ] Update any troubleshooting docs

### Final Verification

- [ ] Run reproduction script - should now pass
- [ ] Verify `metadata.renderedAssertionValue` shows actual value in web UI
- [ ] Test with real LLM provider (not just echo)

---

## 6. Documentation Updates

### 6.1 Assertions Documentation

**File:** `site/docs/configuration/assertions.md`

Add section "Dynamic Assertion Values via Scripts":

````markdown
### Dynamic Assertion Values

Assertion values can be generated dynamically using JavaScript, Python, or Ruby scripts:

```yaml
assert:
  - type: llm-rubric
    value: file://rubric.js:generateRubric
  - type: contains
    value: file://checker.py:get_expected_value
  - type: equals
    value: file://validator.rb:expected_output
```
````

The script receives the LLM output and context as parameters and must return the expected value:

**JavaScript:**

```javascript
// rubric.js
module.exports.generateRubric = function (output, context) {
  return `Verify the response about ${context.vars.topic} is accurate and complete`;
};
```

**Python:**

```python
# checker.py
def get_expected_value(output, context):
    return f"Expected: {context['vars']['expected']}"
```

**Ruby:**

```ruby
# validator.rb
def expected_output(output, context)
  "The answer should mention #{context['vars']['keyword']}"
end
```

#### Return Type Requirements

Scripts must return the type expected by the assertion:

| Assertion Type                  | Return Type                       |
| ------------------------------- | --------------------------------- |
| llm-rubric                      | string or object (messages array) |
| equals                          | string or object                  |
| similar, bleu, gleu             | string or array of strings        |
| regex, starts-with, levenshtein | string                            |
| contains                        | string or number                  |
| webhook                         | string (URL)                      |

**Note:** For `javascript`, `python`, and `ruby` assertion types, the script should return a boolean, number, or GradingResult object (the assertion result). For all other assertion types, the script should return the expected value to compare against.

````

### 6.2 UX Change Warning

**IMPORTANT:** This fix changes what users see in the UI and metadata.

**Before (Bug):**
- `metadata.renderedAssertionValue` = `"file://rubric.js:generate"`
- Users could see the script path in evaluation results

**After (Fixed):**
- `metadata.renderedAssertionValue` = `"Verify the response covers machine learning basics"`
- Users see the actual script output in evaluation results

**Migration Note for Documentation:**

```markdown
> **Breaking Change in v0.120.0:** When using `file://` script references in assertion values,
> the web UI and metadata now display the actual script output instead of the file path.
> This is the correct behavior - the script output is what's actually used for evaluation.
> If you were relying on seeing the file path for debugging, you can find it in the
> `assertion.value` field which preserves the original configuration.
````

**Add to Troubleshooting docs:**

````markdown
### Script Values Not Working

If your file-based script assertion isn't working:

1. **Check return type**: The script must return the type expected by the assertion
   - `llm-rubric`: string or object
   - `regex`: string only
   - `bleu`/`gleu`: string or array of strings

2. **Check function name**: Use `file://script.js:functionName` syntax

3. **Verify script runs**: Add `console.log` - output appears in debug logs

4. **Common mistake**: Returning a function instead of a value

   ```javascript
   // ❌ Wrong - returns function
   module.exports.rubric = () => 'text';

   // ✅ Correct - returns value
   module.exports.rubric = (output, context) => 'text';
   ```
````

````

### 6.3 Changelog Entry

**File:** `CHANGELOG.md`

```markdown
### Fixed

- fix(assertions): use file-based script output across all assertion types (#6200)
  - Scripts referenced via `file://` in assertion values now correctly pass their output to assertion handlers
  - Affected types: llm-rubric, model-graded-closedqa, factuality, g-eval, context-recall, similar, regex, starts-with, equals, levenshtein, bleu, gleu, rouge, webhook, pi, classifier
  - Added descriptive error when script returns invalid type for assertion
  - **UX Change:** Web UI now displays actual script output instead of file path in assertion metadata
````

---

## 7. Risk Assessment

### Low Risk

- **Pattern is proven** - `contains.ts` handlers already work this way
- **Backward compatible** - No change when `valueFromScript` is undefined
- **Clear safeguards** - Explicit exclusion of script assertion types

### Potential Issues

| Risk                          | Probability | Impact | Mitigation                                        |
| ----------------------------- | ----------- | ------ | ------------------------------------------------- |
| Script returns wrong type     | Low         | Medium | Add type validation with descriptive error        |
| Breaks javascript/python/ruby | Low         | High   | Explicit exclusion via `SCRIPT_RESULT_ASSERTIONS` |
| Performance impact            | Very Low    | Low    | Only one additional check per assertion           |

### Edge Cases to Test

- Script returns empty string
- Script returns `null` or `undefined`
- Script returns object (for assertions that accept objects)
- Script returns array (for BLEU/GLEU references)
- Script throws error
- Function name not found in script
- Package path (`npm:`) references

---

## 8. Open Questions / Follow-ups

1. **Async scripts** - Currently synchronous per handler; worth tracking for future enhancement
2. **GradingResult from scripts** - Should non-script assertions accept GradingResult? Currently throws error
3. **Opt-out config** - Do we need per-assertion opt-out? Probably not, but monitor feedback
4. **Webhook special case** - Does webhook interpret its value as code? Audit confirms no - it uses value as URL
5. **Go support in assertions** - Users may expect `file://script.go` to work like Python/Ruby. Consider adding as separate feature request
6. **exec: support in assertions** - Similar to Go, users may expect `exec:./script.sh` to work. Consider as future enhancement

---

## 9. Implementation Steps

### Step 1: Create Feature Branch

```bash
git checkout main
git pull origin main
git checkout -b fix/script-value-resolution-6200
```

### Step 2: Add Centralized Fix

Edit `src/assertions/index.ts` as described in Section 3.

### Step 3: Add Tests

Create test fixtures and unit tests as described in Section 4.

### Step 4: Run Validation

```bash
npm run lint
npm run format
npm run tsc
npm test -- --coverage --randomize
```

### Step 5: Documentation

Update docs as described in Section 6.

### Step 6: Create PR

```bash
git add .
git commit -m "$(cat <<'EOF'
fix(assertions): use script output for all assertion types with file:// references (#6200)

- Add centralized script value resolution in runAssertion
- Scripts referenced via file:// now pass output to assertion handlers
- Exclude javascript/python/ruby types (they interpret value as code)
- Add descriptive error for invalid script return types
- Add unit and integration tests

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"

git push -u origin fix/script-value-resolution-6200

gh pr create --title "fix(assertions): use script output for file:// references (#6200)" --body "$(cat <<'EOF'
## Summary
- Fix bug where file-based scripts in assertion values weren't being used
- Add centralized resolution in `runAssertion`
- Scripts now correctly pass output to all assertion handlers

## Test Plan
- [ ] Unit tests for centralized resolution
- [ ] Integration tests with JS/Python/Ruby fixtures
- [ ] Manual verification with reproduction script
- [ ] Full test suite passes

Fixes #6200

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## 10. Estimated Effort

| Task                                                        | Time            |
| ----------------------------------------------------------- | --------------- |
| Prototype validation (fix + full test suite)                | 1-2 hours       |
| Implementation (centralized fix + safeguards)               | 1 hour          |
| Unit tests (including edge cases & regression tests)        | 4-5 hours       |
| Integration tests (deterministic + JS/Python/Ruby fixtures) | 2-3 hours       |
| Documentation (with UX warnings + troubleshooting)          | 1-2 hours       |
| QA & verification (mock-based)                              | 2 hours         |
| **Total**                                                   | **11-15 hours** |

**Note:** The estimate reflects:

- Prototype validation before committing to implementation
- Comprehensive regression tests for javascript/python/ruby assertions
- Edge case testing (undefined, null, empty string, arrays, objects, numbers, npm:)
- Deterministic integration tests (contains, regex, equals with failure message verification)
- Mock-based QA methodology instead of log inspection
- Detailed documentation with return type requirements, UX warnings, and troubleshooting guides
