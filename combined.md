# Task: Fix Issue #5519 - Python Assertion File References Loaded as Inline Code

## Issue Description

When `promptfooconfig.yaml` references `file://tests.yaml` which contains Python assertion references like `file://assertion.py` (without function names), the Python file content gets loaded as inline text instead of being preserved as a file reference. This causes the assertion system to wrap the code in a `main()` function instead of calling the expected `get_assert()` function.

**GitHub Issue**: https://github.com/promptfoo/promptfoo/issues/5519

## Current Behavior (Broken)

1. **Config Chain**: `promptfooconfig.yaml` → `file://tests.yaml` → `file://assertion.py`
2. **Test Loading**: `maybeLoadConfigFromExternalFile()` processes the test YAML
3. **Python File Loading**: `file://assertion.py` gets loaded as text content:
   ```json
   {
     "type": "python",
     "value": "def get_assert(output, context):\n    return {...}"
   }
   ```
4. **Assertion Processing**: Receives inline Python code, wraps in `main()`, calls `main()` instead of `get_assert()`
5. **Result**: Wrong function called, assertions fail

## Expected Behavior

1. **Config Chain**: Same as above
2. **Python File Preservation**: `file://assertion.py` should be preserved as:
   ```json
   {
     "type": "python", 
     "value": "file://assertion.py"
   }
   ```
3. **Assertion Processing**: Receives file reference, calls `runPython(filePath, 'get_assert', ...)`
4. **Result**: Correct function called, assertions work

## Detailed Problem Analysis

### Observable Symptoms

- **"Should PASS" test fails** with error: "Python assertion must return a boolean, number, or {pass, score, reason} object. Got instead: {}"
  - Root cause: `get_assert` function is defined but never called; `main()` wrapper returns `None`
- **"Should FAIL" test passes** unexpectedly
  - Root cause: Top-level `return` statement becomes valid inside `main()` wrapper
  - The `inspect.stack()[0][3]` correctly reports function name as `main`

### Contract Violation

The core issue is a **contract violation** between the config loader and assertion system:
- **Config loader contract**: Process structural file references (`tests: file://tests.yaml`)
- **Assertion system contract**: Handle executable file references (`value: file://assert.py`)

The config loader violates this by treating executable references as structural ones, breaking the semantic distinction between data inclusion and code execution.

## Root Cause Analysis

### Call Flow Investigation

1. **Test YAML Loading**: `src/util/testCaseReader.ts:47`
   ```typescript
   const yamlData = maybeLoadConfigFromExternalFile(rawData);
   ```

2. **Recursive Processing**: `src/util/file.ts:179-191` (`maybeLoadConfigFromExternalFile`)
   - Recursively walks config objects
   - Calls `maybeLoadFromExternalFile()` on all string values

3. **File Loading**: `src/util/file.ts:46-159` (`maybeLoadFromExternalFile`)
   - Currently only preserves Python/JS files WITH function names (PR #5548)
   - Python/JS files WITHOUT function names get loaded as content (lines 140-158)

### Context-Agnostic Dereferencing Problem

The fundamental issue is **over-eager, context-agnostic dereferencing**:
- The dereferencer treats all `file://` references uniformly as content includes
- It lacks context to distinguish between:
  - **Structural references**: `tests: file://tests.yaml` (should be dereferenced)
  - **Executable references**: `value: file://assert.py` (should be preserved)

### Current Fix Coverage

My current PR (#5548) only handles:
- ✅ `file://assert.py:function_name` → preserved as file reference
- ❌ `file://assert.py` → loaded as content (the #5519 issue)

## Impact Analysis

### Affected Python Touchpoints

| Use Case | Path | Impact | Notes |
|----------|------|--------|-------|
| **Assertions** | `maybeLoadConfigFromExternalFile` | 🔴 **BROKEN** - Issue #5519 | Primary issue |
| **Providers** | `parsePathOrGlob` directly | ✅ **WORKING** - Not affected | Uses direct parsing |
| **Prompts** | `parsePathOrGlob` directly | ✅ **WORKING** - Not affected | Uses direct parsing |
| **Test Cases** | Specialized logic | ✅ **WORKING** - Not affected | Has own parsing |
| **Extension Hooks** | `maybeLoadConfigFromExternalFile` | ⚠️ **POTENTIAL** - Needs investigation | May be affected |
| **Red Team Strategies** | `maybeLoadConfigFromExternalFile` | ⚠️ **POTENTIAL** - Needs investigation | May be affected |

### Behavior Inconsistency Across Formats

Critical finding: The bug creates **inconsistent behavior across config formats**:
- **YAML tests**: Go through `maybeLoadConfigFromExternalFile` → Python files inlined → broken
- **JSON tests**: Bypass `maybeLoadConfigFromExternalFile` → Python files preserved → working
- **Inline tests**: No file loading → Python files preserved → working

This inconsistency violates user expectations and makes the system unpredictable.

### Key Insight: Limited Scope

The issue **only affects Python files loaded through `maybeLoadConfigFromExternalFile`**, which is primarily used for test configuration processing. Providers and prompts use `parsePathOrGlob` directly and are not affected.

## Proposed Solutions

### Option 1: Context-Aware Fix (Recommended)

**Approach**: Modify `maybeLoadFromExternalFile` to detect assertion contexts and preserve Python/JS file references only when loading assertion values.

**Implementation**:
1. Add context parameter to `maybeLoadFromExternalFile(filePath, context?)`
2. Update assertion loading call sites to pass `'assertion'` context
3. Preserve Python/JS files in assertion contexts:
   ```typescript
   // For assertion contexts, always preserve Python/JS file references
   if (context === 'assertion' && (cleanPath.endsWith('.py') || isJavascriptFile(cleanPath))) {
     return renderedFilePath;
   }
   ```

**Pros**:
- ✅ **Minimal risk** - only affects assertion loading
- ✅ **Preserves existing behavior** for other use cases
- ✅ **Surgical fix** targeting exact problem
- ✅ **Respects separation of concerns** - config loader stays structural

**Cons**:
- ❌ **Medium complexity** - requires context detection mechanism
- ❌ **Multiple call sites** to update

### Option 2: Schema-Aware Skip for Assertion Values

**Approach**: Modify `maybeLoadConfigFromExternalFile` to detect assertion objects and skip dereferencing their `value` field.

**Implementation**:
```typescript
// Skip dereferencing for assertion values
if (key === 'value' && config.type && ['python', 'javascript'].includes(config.type)) {
  return config[key]; // Preserve as-is
}
```

**Pros**:
- ✅ **Surgical fix** focused on failing path
- ✅ **Simple detection** based on object structure

**Cons**:
- ❌ **Couples generic utility to assertion schema**
- ❌ **May miss other code reference contexts**
- ❌ **Harder to maintain** long-term

### Option 3: Blanket Python/JS Preservation

**Approach**: Always preserve `file://` references for Python/JS files regardless of context.

**Implementation**:
```typescript
// Always preserve Python/JS file references
if (cleanPath.endsWith('.py') || isJavascriptFile(cleanPath)) {
  return renderedFilePath;
}
```

**Pros**:
- ✅ **Simple implementation**
- ✅ **Consistent behavior** across all contexts
- ✅ **Future-proof** for similar issues
- ✅ **Follows best practice** - generic loaders should be data-centric

**Cons**:
- ❌ **High risk** - changes behavior across many contexts
- ❌ **Could break extension hooks, red team strategies, etc.**
- ❌ **Unknown impact** on other Python file loading scenarios

### Option 4: Dedicated File Reference Loader

**Approach**: Route Python/JS references through a dedicated loader similar to `src/util/fileReference.ts`.

**Pros**:
- ✅ **Clean separation of concerns**
- ✅ **Consistent helper usage**

**Cons**:
- ❌ **Requires broader architectural changes**
- ❌ **More complex implementation**

## Recommended Implementation Plan

### Phase 1: Context-Aware Fix (Primary Recommendation)

Based on comprehensive analysis, **Option 1 (Context-Aware)** is recommended because it:
- Minimizes risk by only affecting assertion contexts
- Maintains backward compatibility
- Respects architectural boundaries
- Provides surgical fix for the specific problem

#### Implementation Strategy: Minimize API Churn

**Preferred Approach**: Keep existing public API stable by using optional parameters with safe defaults:

1. **Modify Function Signature (Backward Compatible)**:
   ```typescript
   // Existing signature remains valid, new optional parameter defaults to 'general'
   function maybeLoadFromExternalFile(
     filePath: string | object | Function | undefined | null,
     context?: 'assertion' | 'general'
   ) {
     // Default to 'general' for backward compatibility
     const loadContext = context || 'general';
     // ... rest of implementation
   }
   ```

2. **Schema-Aware Context Detection**:
   ```typescript
   // In maybeLoadConfigFromExternalFile - detect assertion objects specifically
   if (config && typeof config === 'object' && config !== null) {
     const result: Record<string, any> = {};
     for (const key of Object.keys(config)) {
       // Only set assertion context for specific assertion value patterns
       const isAssertionValue = key === 'value' && 
         config.type && 
         ['python', 'javascript'].includes(config.type);
       const childContext = isAssertionValue ? 'assertion' : context;
       result[key] = maybeLoadConfigFromExternalFile(config[key], childContext);
     }
     return result;
   }
   return maybeLoadFromExternalFile(config, context);
   ```

3. **Add Preservation Logic with Logging**:
   ```typescript
   // In maybeLoadFromExternalFile
   if (context === 'assertion' && (cleanPath.endsWith('.py') || isJavascriptFile(cleanPath))) {
     logger.debug(`Preserving Python/JS file reference in assertion context: ${renderedFilePath}`);
     return renderedFilePath; // Preserve file reference
   }
   ```

4. **Reuse Existing Utilities**:
   - Use `isJavascriptFile()` for JS file detection
   - Use `parseFileUrl()` for splitting `file://path:function`
   - Add clear error for unsupported `file://*.py:function` glob patterns

### Phase 2: Call-Site Audit & Risk Validation

#### Critical: Complete Call-Site Inventory

Before implementation, audit all current consumers of both functions:

**`maybeLoadConfigFromExternalFile` Call Sites**:
```bash
# Find all call sites
rg "maybeLoadConfigFromExternalFile" --type ts -l

# Expected locations to verify:
# - src/util/testCaseReader.ts (YAML/JSON test loading)
# - src/providers/index.ts (provider config loading)  
# - src/providers/http.ts (HTTP provider body processing)
# - src/util/config/load.ts (config dereferencing)
# - src/prompts/processors/yaml.ts (YAML prompt processing)
# - src/prompts/processors/json.ts (JSON prompt processing)
# - Extension/plugin loading paths
```

**`maybeLoadFromExternalFile` Direct Call Sites**:
```bash
# Find direct calls (bypassing config processing)
rg "maybeLoadFromExternalFile" --type ts -A 2 -B 2 | grep -v "maybeLoadConfigFromExternalFile"

# Verify these don't need context but will get safe defaults
```

#### Risk Area Validation Checklist

- [ ] **Provider Loading Paths**
  - [ ] `src/providers/index.ts` - Verify provider configs don't unexpectedly preserve Python files
  - [ ] `src/providers/http.ts` - Check HTTP provider body processing
  - [ ] Custom provider loaders

- [ ] **Prompt Processing Paths**  
  - [ ] `src/prompts/processors/yaml.ts` - Ensure YAML prompts with Python refs work correctly
  - [ ] `src/prompts/processors/json.ts` - Ensure JSON prompts with Python refs work correctly
  - [ ] Verify prompts don't use assertions format accidentally

- [ ] **Config Loading Paths**
  - [ ] `src/util/config/load.ts` - General config dereferencing
  - [ ] Transform/derived metrics paths
  - [ ] Extension/plugin configuration loading

- [ ] **Tool & Extension Paths**
  - [ ] Tool definitions that might reference Python files
  - [ ] Extension hooks and custom loaders
  - [ ] Red team strategy configurations

### Phase 3: Monitoring & Validation

1. Monitor for similar issues in other contexts
2. If patterns emerge, consider broader unification approach
3. Document decision and rationale
4. Consider feature flag for rollback safety

### Alternative: Blanket Preservation (If Context-Aware Proves Complex)

If the context-aware approach proves too complex, **Option 3 (Blanket Preservation)** is the fallback:
- Simpler implementation
- Follows the principle that generic loaders should be data-centric
- Aligns with the finding that Python/JS files are primarily executable resources

## Files to Modify

1. **`src/util/file.ts`**:
   - Add context parameter to `maybeLoadFromExternalFile`
   - Add assertion context preservation logic
   - Update `maybeLoadConfigFromExternalFile` to pass context

2. **`test/util/file.test.ts`**:
   - Add context-aware test cases
   - Add integration test for #5519 scenario
   - Add regression tests for non-assertion contexts

## Comprehensive Test Scenarios

### Unit Tests

```typescript
describe('Context-aware Python file handling', () => {
  it('should preserve Python files without function names in assertion context', () => {
    const result = maybeLoadFromExternalFile('file://assert.py', 'assertion');
    expect(result).toBe('file://assert.py');
  });

  it('should preserve Python files with function names in assertion context', () => {
    const result = maybeLoadFromExternalFile('file://assert.py:custom_func', 'assertion');
    expect(result).toBe('file://assert.py:custom_func');
  });

  it('should preserve JavaScript files in assertion context', () => {
    const result = maybeLoadFromExternalFile('file://assert.js', 'assertion');
    expect(result).toBe('file://assert.js');
  });

  it('should load Python file content in general context', () => {
    // Mock file system
    const result = maybeLoadFromExternalFile('file://script.py', 'general');
    expect(result).toBe('# Python file content...');
  });

  it('should handle Windows drive letters correctly in assertion context', () => {
    const result = maybeLoadFromExternalFile('file://C:/path/assert.py', 'assertion');
    expect(result).toBe('file://C:/path/assert.py');
  });

  it('should still load non-Python files in assertion context', () => {
    const result = maybeLoadFromExternalFile('file://data.json', 'assertion');
    expect(result).toEqual({ key: 'value' }); // Parsed JSON
  });
});
```


### End-to-End Test

```typescript
// Note: The following is a conceptual E2E test. The developer will need to
// replace `runEvaluation` with the actual method for invoking promptfoo's
// evaluation programmatically and adapt to the project's E2E test patterns.

it('should reproduce and fix issue #5519 scenario', async () => {
  // Create test files in temp directory
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-test-'));
  
  // Create files matching issue #5519
  await fs.writeFile(path.join(testDir, 'promptfooconfig.yaml'), `
    providers:
      - id: "python:./provider.py"
    tests:
      - file://tests.yaml
  `);
  
  await fs.writeFile(path.join(testDir, 'tests.yaml'), `
    - vars:
        name: Should PASS
      assert:
      - type: python
        value: file://good_assertion.py
    - vars:
        name: Should FAIL
      assert:
      - type: python
        value: file://bad_assertion.py
  `);
  
  await fs.writeFile(path.join(testDir, 'good_assertion.py'), `
def get_assert(output, context):
    return {
        "pass": True,
        "score": 1,
        "reason": "Assertion function 'get_assert' was called.",
    }
  `);
  
  await fs.writeFile(path.join(testDir, 'bad_assertion.py'), `
import inspect
return {
    "pass": True,
    "score": 1,
    "reason": f"Assertion function '{inspect.stack()[0][3]}' was called.",
}
  `);
  
  // Run evaluation - replace with actual promptfoo evaluation method
  const result = await runEvaluation(path.join(testDir, 'promptfooconfig.yaml'));
  
  // Verify correct behavior
  expect(result.results[0].pass).toBe(true);  // "Should PASS" now passes
  expect(result.results[1].pass).toBe(false); // "Should FAIL" now fails
  
  // Verify correct function was called
  expect(result.results[0].reason).toContain("get_assert");
  expect(result.results[1].reason).toContain("SyntaxError");
  
  // Cleanup
  await fs.rm(testDir, { recursive: true }); // Updated from deprecated fs.rmdir
});
```

## Risk Assessment

### Option 1 (Context-aware) - Recommended
- **Risk**: **Low** - Only affects assertion loading
- **Complexity**: **Medium** - Requires context parameter threading
- **Compatibility**: **High** - Preserves all existing behavior
- **Maintenance**: **Medium** - Additional complexity but well-scoped

### Option 2 (Schema-aware)
- **Risk**: **Low** - Very targeted fix
- **Complexity**: **Low** - Simple object structure detection
- **Compatibility**: **High** - Minimal changes
- **Maintenance**: **Low** - But couples components

### Option 3 (Blanket preservation)
- **Risk**: **Medium-High** - Changes behavior across many contexts
- **Complexity**: **Low** - Simple logic change
- **Compatibility**: **Unknown** - Could break existing configurations
- **Maintenance**: **Low** - Simple and consistent rule

## Success Criteria (Enhanced)

### Core Functionality
1. ✅ **Issue #5519 scenario works correctly**
   - YAML-based tests with `file://assert.py` call `get_assert()` function
   - YAML-based tests with `file://assert.py:custom_func` call specified function
   - "Should PASS" test passes, "Should FAIL" test fails as expected

2. ✅ **Format consistency achieved**
   - **YAML tests**: Python file references preserved and execute correctly
   - **JSON tests**: Behavior unchanged (already working)
   - **Inline tests**: Behavior unchanged (already working)
   - All three formats now behave consistently for Python assertions

3. ✅ **Backward compatibility maintained**
   - Existing assertion tests continue to pass
   - Inline Python assertions still work with `main()` wrapper
   - Provider and prompt Python files completely unaffected
   - No regressions in other Python file loading scenarios

### Edge Cases & Error Handling
4. ✅ **Edge cases handled properly**
   - Windows drive letter paths with `:function` preserved correctly
   - Nunjucks-rendered `file://` references preserve correctly
   - Mixed assertion types (python, contains, javascript) work correctly

5. ✅ **Clear error messages for unsupported patterns**
   - `file://*.py:get_assert` (glob + function) yields clear downstream error
   - JavaScript function references behave consistently with Python

### System Integration  
6. ✅ **No unintended side effects**
   - All call sites audited and verified safe
   - Provider configs don't unexpectedly preserve Python files
   - Prompt processing paths unaffected
   - Extension/tool loading paths verified safe

7. ✅ **Documentation and observability**
   - Clear documentation of behavior change
   - Debug logging for assertion context preservation
   - CHANGELOG entry for regression fix

## Migration and Documentation

### CHANGELOG Entry
```markdown
### Fixed
- Fixed regression in v0.118.3 where Python assertion files referenced from YAML test files (e.g., `file://assertion.py`) were incorrectly loaded as inline code instead of being executed as external functions. This caused assertions to call `main()` instead of the intended `get_assert()` function. (#5519, #5548)
```

### Documentation Updates
- Clarify that `.py`/JS `file://` references in assertions are executable references, not content includes
- Document the distinction between structural file references (config inclusion) and executable file references (code execution)
- Add examples showing proper usage of Python assertion files in YAML tests

## Future Considerations

- **Architectural principle**: Generic loaders should be data-centric; executable resources should be handled by specialized loaders
- **Consider deprecating** inline Python code in favor of file references for better maintainability
- **Evaluate consistency** across all file reference handling to prevent similar issues
- **Monitor for patterns** that might suggest need for broader architectural changes

## Quick Workarounds (Until Fix Released)

For users experiencing this issue:
1. Move tests inline into `promptfooconfig.yaml` instead of separate YAML file
2. Use JSON test files instead of YAML (bypasses the problematic dereferencing)
3. Use explicit function names: `file://assert.py:get_assert` (works with current PR #5548)
4. Pin to promptfoo version prior to 0.118.3

## Complete Implementation Checklist

### Pre-Implementation Setup

- [ ] **Checkout Feature Branch**
  ```bash
  git checkout main
  git pull origin main  
  git checkout -b fix/python-assertion-yaml-loading
  ```

- [ ] **Verify Current Bug Exists**
  ```bash
  # Create reproduction case in /tmp/test-5519-repro
  mkdir /tmp/test-5519-repro && cd /tmp/test-5519-repro
  
  # Create test files (see reproduction files below)
  # Run promptfoo eval -c promptfooconfig.yaml
  # Verify "Should PASS" fails and "Should FAIL" passes
  ```

### Core Implementation Steps

#### Step 1: Modify `src/util/file.ts`

- [ ] **Add Context Type Definition**
  ```typescript
  type FileLoadContext = 'assertion' | 'general' | undefined;
  ```

- [ ] **Update `maybeLoadFromExternalFile` Signature**
  ```typescript
  export function maybeLoadFromExternalFile(
    filePath: string | object | Function | undefined | null,
    context?: FileLoadContext
  ) {
  ```

- [ ] **Add Context-Aware Logic (after line 66)**
  ```typescript
  // For assertion contexts, always preserve Python/JS file references
  if (context === 'assertion' && (cleanPath.endsWith('.py') || isJavascriptFile(cleanPath))) {
    return renderedFilePath;
  }
  ```

- [ ] **Update `maybeLoadConfigFromExternalFile` Signature**
  ```typescript
  export function maybeLoadConfigFromExternalFile(
    config: any, 
    context?: FileLoadContext
  ): any {
  ```

- [ ] **Add Context Detection Logic (replace lines 183-188)**
  ```typescript
  if (config && typeof config === 'object' && config !== null) {
    const result: Record<string, any> = {};
    for (const key of Object.keys(config)) {
      // Detect assertion value context
      const isAssertionValue = key === 'value' && 
        config.type && 
        ['python', 'javascript'].includes(config.type);
      const childContext = isAssertionValue ? 'assertion' : context;
      result[key] = maybeLoadConfigFromExternalFile(config[key], childContext);
    }
    return result;
  }
  return maybeLoadFromExternalFile(config, context);
  ```

#### Step 2: Update Initial Call Sites

- [ ] **Update Initial Call Sites (e.g., `src/util/testCaseReader.ts:47`)**
  
  Ensure that the initial, top-level calls to `maybeLoadConfigFromExternalFile` start with the default `'general'` context. The recursive logic you'll add will handle switching to the `'assertion'` context internally.
  
  ```typescript
  // In src/util/testCaseReader.ts
  // Change from:
  const yamlData = maybeLoadConfigFromExternalFile(rawData);
  // To:
  const yamlData = maybeLoadConfigFromExternalFile(rawData, 'general');
  ```

- [ ] **Find and Update Other Top-Level Call Sites**
  ```bash
  # Search for other callers
  rg "maybeLoadConfigFromExternalFile" --type ts -A 2 -B 2
  
  # Update each top-level call site to pass 'general' context as the starting point
  # The recursive context switching happens automatically in the implementation
  ```

### Unit Test Implementation

#### Step 3: Add Tests to `test/util/file.test.ts`

- [ ] **Context-Aware Function Tests**
  ```typescript
  describe('Context-aware Python/JS file handling', () => {
    it('should preserve Python files without function names in assertion context', () => {
      const result = maybeLoadFromExternalFile('file://assert.py', 'assertion');
      expect(result).toBe('file://assert.py');
    });

    it('should preserve Python files with function names in assertion context', () => {
      const result = maybeLoadFromExternalFile('file://assert.py:custom_func', 'assertion');
      expect(result).toBe('file://assert.py:custom_func');
    });

    it('should preserve JavaScript files in assertion context', () => {
      const result = maybeLoadFromExternalFile('file://assert.js', 'assertion');
      expect(result).toBe('file://assert.js');
    });

    it('should preserve TypeScript files in assertion context', () => {
      const result = maybeLoadFromExternalFile('file://assert.ts', 'assertion');
      expect(result).toBe('file://assert.ts');
    });

    it('should preserve MJS files in assertion context', () => {
      const result = maybeLoadFromExternalFile('file://assert.mjs', 'assertion');
      expect(result).toBe('file://assert.mjs');
    });

    it('should handle Windows drive letters with function correctly in assertion context', () => {
      const result = maybeLoadFromExternalFile('file://C:/path/assert.py:get_assert', 'assertion');
      expect(result).toBe('file://C:/path/assert.py:get_assert');
    });

    it('should handle Nunjucks-rendered file references in assertion context', () => {
      // Test that templated file paths are preserved after rendering
      const result = maybeLoadFromExternalFile('file://{{baseDir}}/assert.py', 'assertion');
      // Assuming Nunjucks renders this to a proper path, it should still be preserved
      expect(result).toMatch(/^file:\/\//);
      expect(result).toMatch(/\.py$/);
    });

    it('should still load non-Python/JS files in assertion context', () => {
      // Mock fs.readFileSync and fs.existsSync
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('{"key": "value"}');
      
      const result = maybeLoadFromExternalFile('file://data.json', 'assertion');
      expect(result).toEqual({ key: 'value' });
      
      jest.restoreAllMocks();
    });

    it('should load Python file content in general context', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('# Python content');
      
      const result = maybeLoadFromExternalFile('file://script.py', 'general');
      expect(result).toBe('# Python content');
      
      jest.restoreAllMocks();
    });

    it('should default to general context when no context provided', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('# Python content');
      
      const result = maybeLoadFromExternalFile('file://script.py');
      expect(result).toBe('# Python content');
      
      jest.restoreAllMocks();
    });
  });
  ```

- [ ] **Config Loading Context Detection Tests**
  ```typescript
  describe('maybeLoadConfigFromExternalFile context detection', () => {
    beforeEach(() => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockImplementation((path) => {
        if (path.toString().includes('data.json')) {
          return '{"loaded": true}';
        }
        return 'file content';
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should detect assertion context for python type', () => {
      const config = {
        assert: [
          { type: 'python', value: 'file://assert.py' }
        ]
      };
      
      const result = maybeLoadConfigFromExternalFile(config);
      expect(result.assert[0].value).toBe('file://assert.py');
    });

    it('should detect assertion context for javascript type', () => {
      const config = {
        assert: [
          { type: 'javascript', value: 'file://assert.js:custom_func' }
        ]
      };
      
      const result = maybeLoadConfigFromExternalFile(config);
      expect(result.assert[0].value).toBe('file://assert.js:custom_func');
    });

    it('should not affect non-assertion python files', () => {
      const config = {
        customScript: 'file://script.py',
        vars: {
          data: 'file://data.json'
        }
      };
      
      const result = maybeLoadConfigFromExternalFile(config);
      expect(result.customScript).toBe('file content'); // Loaded
      expect(result.vars.data).toEqual({ loaded: true }); // Loaded and parsed
    });

    it('should handle nested assertion objects', () => {
      const config = {
        tests: [
          {
            assert: [
              { type: 'python', value: 'file://assert1.py' },
              { type: 'javascript', value: 'file://assert2.js' },
              { type: 'contains', value: 'some text' }
            ]
          }
        ]
      };
      
      const result = maybeLoadConfigFromExternalFile(config);
      expect(result.tests[0].assert[0].value).toBe('file://assert1.py');
      expect(result.tests[0].assert[1].value).toBe('file://assert2.js');
      expect(result.tests[0].assert[2].value).toBe('some text'); // Non-file string
    });

    it('should handle mixed assertion types', () => {
      const config = {
        assert: [
          { type: 'python', value: 'file://assert.py' },
          { type: 'contains', value: 'text to find' },
          { type: 'javascript', value: 'return output.includes("test")' }, // Inline JS
          { type: 'python', value: 'file://another_assert.py:custom_function' }
        ]
      };
      
      const result = maybeLoadConfigFromExternalFile(config);
      expect(result.assert[0].value).toBe('file://assert.py');
      expect(result.assert[1].value).toBe('text to find');
      expect(result.assert[2].value).toBe('return output.includes("test")');
      expect(result.assert[3].value).toBe('file://another_assert.py:custom_function');
    });
  });
  ```

### Integration Test Implementation

#### Step 4: Add Integration Test

- [ ] **Create Test Files for Integration Test**
  ```typescript
  // Note: The following is a conceptual integration test. The developer will need to
  // replace deprecated `fs.rmdir` with `fs.rm` and adapt the test structure to match
  // the project's existing integration test patterns.
  
  describe('Issue #5519 Integration Test', () => {
    let tempDir: string;
    
    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-5519-'));
    });
    
    afterEach(async () => {
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true }); // Updated from deprecated fs.rmdir
      }
    });

    it('should reproduce and fix issue #5519 scenario', async () => {
      // Create promptfooconfig.yaml
      await fs.writeFile(path.join(tempDir, 'promptfooconfig.yaml'), 
        'providers:\n' +
        '  - id: "python:./provider.py"\n' +
        'tests:\n' +
        '  - file://tests.yaml\n'
      );
      
      // Create provider.py
      await fs.writeFile(path.join(tempDir, 'provider.py'),
        'def call_api(prompt, options, context):\n' +
        '    return {"output": "LLM output."}\n'
      );
      
      // Create tests.yaml
      await fs.writeFile(path.join(tempDir, 'tests.yaml'),
        '- vars:\n' +
        '    name: Should PASS\n' +
        '  assert:\n' +
        '  - type: python\n' +
        '    value: file://good_assertion.py\n' +
        '- vars:\n' +
        '    name: Should FAIL\n' +
        '  assert:\n' +
        '  - type: python\n' +
        '    value: file://bad_assertion.py\n'
      );
      
      // Create good_assertion.py
      await fs.writeFile(path.join(tempDir, 'good_assertion.py'),
        'def get_assert(output, context):\n' +
        '    return {\n' +
        '        "pass": True,\n' +
        '        "score": 1,\n' +
        '        "reason": "Assertion function \'get_assert\' was called.",\n' +
        '    }\n'
      );
      
      // Create bad_assertion.py
      await fs.writeFile(path.join(tempDir, 'bad_assertion.py'),
        'import inspect\n' +
        'return {\n' +
        '    "pass": True,\n' +
        '    "score": 1,\n' +
        '    "reason": f"Assertion function \'{inspect.stack()[0][3]}\' was called.",\n' +
        '}\n'
      );
      
      // Test the config loading behavior directly
      const configPath = path.join(tempDir, 'tests.yaml');
      const rawData = yaml.load(fs.readFileSync(configPath, 'utf-8'));
      const processedData = maybeLoadConfigFromExternalFile(rawData, 'general');
      
      // Verify Python file references are preserved
      expect(processedData[0].assert[0].value).toBe('file://good_assertion.py');
      expect(processedData[1].assert[0].value).toBe('file://bad_assertion.py');
      
      // Verify the references still start with file:// (not inlined)
      expect(processedData[0].assert[0].value).toMatch(/^file:\/\//);
      expect(processedData[1].assert[0].value).toMatch(/^file:\/\//);
    });
  });
  ```

### Manual QA Test Implementation

#### Step 5: Manual End-to-End Verification

- [ ] **Create Reproduction Files**
  ```bash
  # Create test directory
  mkdir /tmp/test-5519-fix && cd /tmp/test-5519-fix
  
  # Create all test files exactly as in issue description
  ```

- [ ] **Test Files Content**
  
  **promptfooconfig.yaml**:
  ```yaml
  providers:
    - id: "python:./provider.py"
  tests:
    - file://tests.yaml
  ```
  
  **provider.py**:
  ```python
  def call_api(prompt, options, context):
      return {"output": "LLM output."}
  ```
  
  **tests.yaml**:
  ```yaml
  - vars:
      name: Should PASS
    assert:
    - type: python
      value: file://good_assertion.py
  - vars:
      name: Should FAIL
    assert:
    - type: python
      value: file://bad_assertion.py
  ```
  
  **good_assertion.py**:
  ```python
  def get_assert(output, context):
    return {
      "pass": True,
      "score": 1,
      "reason": f"Assertion function 'get_assert' was called.",
    }
  ```
  
  **bad_assertion.py**:
  ```python
  import inspect
  return {
    "pass": True,
    "score": 1,
    "reason": f"Assertion function '{inspect.stack()[0][3]}' was called.",
  }
  ```

- [ ] **Manual Test Execution**
  ```bash
  # Run evaluation
  promptfoo eval -c promptfooconfig.yaml --no-share
  
  # Expected results:
  # ✅ "Should PASS" test now PASSES 
  # ✅ "Should FAIL" test now FAILS with SyntaxError
  # ✅ "Should PASS" reason contains "get_assert"
  # ✅ "Should FAIL" reason contains "SyntaxError" or similar error
  ```

### Regression Testing

#### Step 6: Run Existing Tests

- [ ] **File Utility Tests**
  ```bash
  npm test -- test/util/file.test.ts
  ```

- [ ] **Test Case Reader Tests**
  ```bash  
  npm test -- test/util/testCaseReader.test.ts
  ```

- [ ] **Assertion Tests**
  ```bash
  npm test -- test/assertions/
  ```

- [ ] **Provider Tests (Verify Unaffected)**
  ```bash
  npm test -- test/providers/pythonCompletion.test.ts
  ```

- [ ] **Prompt Tests (Verify Unaffected)**
  ```bash
  npm test -- test/prompts/
  ```

- [ ] **Full Test Suite**
  ```bash
  npm test
  ```

#### Step 7: Edge Case Testing

- [ ] **Windows Path Handling**
  ```typescript
  // Add test for Windows drive letters
  it('should handle Windows paths in assertion context', () => {
    const result = maybeLoadFromExternalFile('file://C:\\path\\to\\assert.py', 'assertion');
    expect(result).toBe('file://C:\\path\\to\\assert.py');
  });
  ```

- [ ] **Glob Pattern Preservation** 
  ```bash
  # Test that glob patterns still work for non-Python files
  # Create test with file://**.json pattern
  ```

- [ ] **Mixed File Types**
  ```typescript
  // Test config with mix of Python, JSON, YAML, and text files
  const config = {
    assert: [
      { type: 'python', value: 'file://assert.py' }
    ],
    data: 'file://data.json',
    template: 'file://template.yaml'
  };
  ```

### Performance Testing

#### Step 8: Performance Validation

- [ ] **Large Config Files**
  ```bash
  # Test with large YAML files containing many assertions
  # Ensure no significant performance degradation
  ```

- [ ] **Nested Structure Performance**
  ```bash
  # Test deeply nested config objects
  # Verify context detection doesn't cause performance issues
  ```

### Documentation and Communication

#### Step 9: Code Documentation

- [ ] **Update Function Documentation**
  ```typescript
  /**
   * Loads configuration from external files, with optional context-aware handling.
   * 
   * @param config - Configuration object that may contain file references
   * @param context - Loading context ('assertion' preserves Python/JS files, 'general' loads content)
   * @returns Processed configuration with file references resolved or preserved based on context
   */
  export function maybeLoadConfigFromExternalFile(
    config: any,
    context?: FileLoadContext
  ): any
  ```

- [ ] **Add Inline Comments**
  ```typescript
  // Context-aware preservation for executable files
  if (context === 'assertion' && (cleanPath.endsWith('.py') || isJavascriptFile(cleanPath))) {
    // Preserve Python/JS file references in assertion contexts to allow
    // the assertion system to execute them with proper function resolution
    return renderedFilePath;
  }
  ```

#### Step 10: Create Pull Request

- [ ] **Commit Changes**
  ```bash
  git add .
  git commit -m "fix: preserve Python/JS file references in YAML assertion contexts
  
  - Add context-aware loading to maybeLoadFromExternalFile
  - Detect assertion contexts in maybeLoadConfigFromExternalFile  
  - Preserve file://assert.py references for proper get_assert() execution
  - Add comprehensive unit and integration tests
  - Fixes issue where YAML tests inlined Python content causing wrong function calls
  
  Fixes #5519"
  ```

- [ ] **Push Branch**
  ```bash
  git push -u origin fix/python-assertion-yaml-loading
  ```

- [ ] **Create Pull Request**
  ```bash
  gh pr create \
    --title "fix: preserve Python/JS file references in YAML assertion contexts" \
    --body "## Problem

  Fixes #5519 - When promptfooconfig.yaml references file://tests.yaml containing Python assertions like file://assertion.py, the config loader incorrectly inlines Python content instead of preserving file references.

  ## Solution

  Added context-aware file loading that preserves Python/JS file references in assertion contexts while maintaining existing behavior for other contexts.

  ## Changes

  - Modified maybeLoadFromExternalFile to accept optional context parameter
  - Added assertion context detection in maybeLoadConfigFromExternalFile
  - Python/JS files in assertion contexts now preserved as file:// references
  - Added comprehensive unit and integration tests
  - Verified no impact on providers, prompts, or other Python file usage

  ## Testing

  - ✅ Unit tests for context-aware behavior
  - ✅ Integration test reproducing exact issue #5519 scenario
  - ✅ Regression tests for existing functionality
  - ✅ Manual E2E verification with reproduction case
  
  ## Risk Assessment
  
  Low risk - surgical fix only affects assertion loading contexts."
  ```

### Final Verification Checklist

#### Step 11: PR Review Checklist

- [ ] **Code Quality**
  - [ ] TypeScript types are correct and exported
  - [ ] Function signatures are backward compatible
  - [ ] Error handling is preserved
  - [ ] No lint or type errors

- [ ] **Test Coverage**
  - [ ] Unit tests cover all new logic paths
  - [ ] Integration test reproduces original issue
  - [ ] Regression tests pass
  - [ ] Edge cases are covered (Windows paths, mixed types)

- [ ] **Functionality Verification** 
  - [ ] Issue #5519 scenario now works correctly
  - [ ] Existing Python file usage (providers, prompts) unaffected
  - [ ] Non-assertion file loading behavior unchanged
  - [ ] Performance is not significantly impacted

- [ ] **Documentation**
  - [ ] Function documentation updated
  - [ ] Inline comments explain context-aware logic
  - [ ] PR description clearly explains problem and solution

## Conclusion

This issue represents a **context-agnostic dereferencing problem** where the config loader violates the contract between structural and executable file references. The recommended **context-aware fix** provides a surgical solution that respects architectural boundaries while ensuring consistent behavior across all test configuration formats.

The comprehensive analysis reveals this is not just a simple bug but an architectural issue that, when fixed properly, will improve the overall robustness and predictability of the file reference system.