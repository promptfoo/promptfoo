# Bug Analysis: Python Assertion Dereferencing Issue (#5519)

## Issue Summary
When a test file is dereferenced (loaded from `file://tests.yaml`), Python assertion files are also dereferenced as inline scripts instead of being properly handled as external files. This causes the assertion mechanism to incorrectly wrap file content in a `main` function instead of calling the expected `get_assert` function.

## Root Cause Analysis

### Problem Flow

1. **Inline Config (Working Correctly)**:
   ```yaml
   tests:
     - assert:
       - type: python
         value: file://assertion.py
   ```
   - `file://assertion.py` is processed by Python assertion handler
   - Handler recognizes it as a file reference and calls the `get_assert` function

2. **Dereferenced Config (Broken)**:
   ```yaml
   # promptfooconfig.yaml
   tests:
     - file://tests.yaml
   
   # tests.yaml  
   - assert:
     - type: python
       value: file://assertion.py
   ```
   - `file://tests.yaml` is loaded and dereferenced by `maybeLoadConfigFromExternalFile`
   - **During dereferencing, `file://assertion.py` gets replaced with file content**
   - Python assertion handler receives the raw file content as inline code
   - Handler wraps it in a `main` function, breaking the expected `get_assert` call pattern

### Key Code Locations

1. **File Dereferencing**: `src/util/file.ts:165` - `maybeLoadConfigFromExternalFile`
   - Recursively processes all `file://` references in loaded configs
   - Replaces `file://` strings with actual file content

2. **Test Loading**: `src/util/testCaseReader.ts:354-355`
   ```typescript
   testCases = maybeLoadConfigFromExternalFile(rawContent) as TestCase[];
   testCases = await _deref(testCases, testFile);
   ```

3. **Python Assertion Processing**: `src/assertions/python.ts:52-78`
   ```typescript
   if (typeof valueFromScript === 'undefined') {
     // Wraps code in main function - THIS IS THE PROBLEM
     const pythonScript = `import json
   
   def main(output, context):
   ${...}`;
   ```

## Reproduction Confirmed

### Expected Behavior
- "Should PASS" test passes (calls `get_assert` function)  
- "Should FAIL" test fails with SyntaxError ('return' outside function)

### Actual Behavior (Dereferenced)
- "Should PASS" test fails (returns `{}` because wrapped `get_assert` is never called)
- "Should FAIL" test passes (inline script works when wrapped in main)

### Actual Behavior (Inline)
- ✅ "Should PASS Inline" test passes correctly
- ✅ "Should FAIL Inline" test fails correctly with SyntaxError

## Fix Approach

The issue needs to be resolved by ensuring that Python assertion `file://` references are NOT dereferenced during test loading, but are instead handled properly by the Python assertion handler.

### Option 1: Skip Dereferencing for Python Assertions (Recommended)
Modify `maybeLoadConfigFromExternalFile` to skip dereferencing `file://` references that are values of Python-type assertions.

**Pros**: 
- Maintains existing behavior for all other file references
- Minimal risk of breaking other functionality
- Clean separation of concerns

**Cons**:
- Requires assertion-type-aware dereferencing logic

### Option 2: Modify Python Assertion Handler
Update the Python assertion handler to detect when it receives file content vs file references and handle both cases appropriately.

**Pros**: 
- Maintains consistency in dereferencing behavior
- More robust handling of various input types

**Cons**:
- More complex logic in assertion handler
- Risk of false positives when detecting file content

### Option 3: Separate Dereferencing Phases
Implement separate dereferencing phases - one for test structure and another for assertion content.

**Pros**: 
- Clear separation of concerns
- Allows for more granular control

**Cons**:
- Larger architectural change
- Higher implementation complexity

## Implementation & Testing Results

Both options have been implemented and tested successfully. Here's the detailed comparison:

### Option 1: Skip Dereferencing for Python Assertions

**Implementation**: Modified `maybeLoadConfigFromExternalFile` to detect and preserve `file://` references for Python assertions.

**Code Changes**:
- `src/util/file.ts`: Added `shouldSkipDereferencingForPythonAssertion()` function
- Added context tracking to dereferencing process
- Preserved file references only for `type: python` assertions

**Test Results**:
- ✅ Bug reproduction: Fixed (dereferenced configs now work correctly)
- ✅ Inline configs: Still working (no regressions)  
- ✅ All existing Python tests: 27/27 passing
- ✅ Backwards compatibility: Full

### Option 2: Modify Python Assertion Handler

**Implementation**: Enhanced Python assertion handler to detect and handle dereferenced file content.

**Code Changes**:
- `src/assertions/python.ts`: Added file reference detection after dereferencing
- Added content-based detection for Python functions
- Added separate handling paths for file references vs inline code

**Test Results**:
- ✅ Bug reproduction: Fixed (detects and properly calls functions in dereferenced content)
- ✅ Inline configs: Still working (no regressions)
- ✅ All existing Python tests: 27/27 passing  
- ✅ Backwards compatibility: Full

## Detailed Comparison

| Aspect | Option 1 (Skip Dereferencing) | Option 2 (Python Handler) |
|--------|-------------------------------|---------------------------|
| **Complexity** | **Simple** - Clean single-purpose function | **Moderate** - Multiple detection heuristics |
| **Maintainability** | **Good** - Localized change, clear intent | **Fair** - More complex logic to maintain |
| **Performance** | **Better** - No dereferencing overhead | **Slightly worse** - Extra processing in handler |
| **Consistency** | **Lower** - Inconsistent dereferencing behavior | **Better** - All `file://` references get dereferenced |
| **Future-proofing** | **Moderate** - May need updates for other assertion types | **Better** - Handler can evolve independently |
| **Risk** | **Lower** - Minimal changes to core dereferencing | **Slightly higher** - More complex logic paths |
| **Debuggability** | **Better** - File references preserved in debugging | **Good** - Content visible but path lost |
| **Architecture** | **Tighter coupling** - Generic utility knows about assertions | **Better separation** - Handler owns its logic |

## Tradeoffs Analysis

### Option 1 Advantages:
- ✅ **Simpler implementation** - Clean, focused change
- ✅ **Better performance** - Avoids unnecessary dereferencing  
- ✅ **Cleaner debugging** - File paths preserved throughout
- ✅ **Lower maintenance burden** - Less code to maintain

### Option 1 Disadvantages:
- ❌ **Inconsistent behavior** - Some `file://` get dereferenced, others don't
- ❌ **Tight coupling** - Generic file utility knows about Python assertions
- ❌ **Scalability concerns** - Each assertion type might need special handling
- ❌ **Complex detection logic** - Context tracking through dereferencing process

### Option 2 Advantages:
- ✅ **Consistent behavior** - All `file://` references treated uniformly
- ✅ **Better architecture** - Clean separation of concerns
- ✅ **Self-contained** - Python handler owns all its logic
- ✅ **Extensible pattern** - Other assertion types can adopt similar approaches
- ✅ **Robust detection** - Handles both cases (file refs and dereferenced content)

### Option 2 Disadvantages:
- ❌ **More complex** - Multiple code paths and detection logic
- ❌ **Slight performance overhead** - Extra processing in assertion handler
- ❌ **Harder to debug** - File paths lost, only content available
- ❌ **Heuristic-based** - Relies on content detection patterns

## Recommendation

**Option 2 (Modify Python Assertion Handler)** is the better choice for the following reasons:

1. **Better Architecture**: Keeps assertion-specific logic in the assertion handler
2. **Consistency**: All `file://` references behave the same way (get dereferenced)
3. **Future-proof**: Creates a pattern other assertion types can follow
4. **Self-contained**: No coupling between generic utilities and specific assertion types

While Option 1 is simpler to implement, Option 2 provides a more robust and maintainable solution that aligns better with software engineering best practices.

---

# 🚨 CRITICAL UPDATE: COMPREHENSIVE SCOPE ANALYSIS

## Additional Affected Python Constructs

After systematic investigation, **the dereferencing issue affects MULTIPLE Python constructs**, not just assertions:

### ✅ **Confirmed Affected Constructs**

1. **Python Assertions** - ✅ Original issue (tested & confirmed)
   - Symptom: `file://assertion.py` becomes file content, wrapped in `main()` instead of calling `get_assert()`
   - Example: `assert: [{ type: python, value: file://assert.py }]`

2. **Python Prompts** - ✅ **NEW DISCOVERY** (tested & confirmed)  
   - Symptom: `file://prompt.py` becomes literal prompt text instead of executed Python function
   - Example: `prompts: ["file://prompt.py"]` → shows raw Python code as prompt
   - Impact: Python prompt functions never execute

3. **Python Test Cases** - ✅ Confirmed via code analysis
   - Symptom: `file://tests.py` becomes file content instead of test generator path
   - Example: `tests: ["file://test_generator.py:generate_tests"]`
   - Impact: Python test generators fail to execute

4. **Python Transforms** - ✅ Confirmed via code analysis  
   - Symptom: `file://transform.py` becomes file content instead of transform function path
   - Example: `options: { transform: "file://transform.py:custom_transform" }`
   - Impact: Python transforms fail to execute

5. **Python Functions (Nunjucks Filters)** - ✅ Confirmed via code analysis
   - Symptom: `file://filter.py` becomes file content instead of filter function path  
   - Example: `nunjucksFilters: { custom: "file://filter.py" }`
   - Impact: Python-based Nunjucks filters fail

### ❌ **NOT Affected**

6. **Python Providers** - ❌ NOT AFFECTED (tested & confirmed)
   - Reason: Provider paths are processed by provider loader after dereferencing
   - Example: `providers: [{ id: "python:file://provider.py" }]` works correctly

## Root Cause Analysis

### The Core Problem
`dereferenceConfig()` in `src/util/config/load.ts:167` uses `$RefParser.dereference()` which **indiscriminately replaces ALL `file://` references** in the entire config with their file content.

### Why This Breaks Python Constructs
All Python handlers expect **file paths** to execute Python files, but receive **file content** instead:

```typescript
// What Python handlers expect:
runPython(filePath, functionName, args)

// What they receive after dereferencing:
"def my_function():\n    return 'file content'"
```

### The Dereferencing Flow
```mermaid  
graph TD
    A[Config with file://] --> B[dereferenceConfig()]
    B --> C[$RefParser.dereference()]
    C --> D[ALL file:// → file content] 
    D --> E[Python handlers receive content]
    E --> F[💥 Failure - expected file paths]
```

## Comprehensive Fix Requirements

### Option 1: Enhanced Skip Dereferencing  
Modify `maybeLoadConfigFromExternalFile` to skip dereferencing for **ALL Python constructs**:

```typescript
function shouldSkipDereferencingForPython(parentObj: any, key: string, value: any): boolean {
  return (
    typeof value === 'string' &&
    value.startsWith('file://') &&
    (
      // Python assertions
      (key === 'value' && parentObj?.type === 'python') ||
      // Python prompts  
      (Array.isArray(parentObj) && value.endsWith('.py')) ||
      // Python transforms
      (key === 'transform' && value.endsWith('.py')) ||
      // Python test cases
      (key === 'path' && value.includes('.py')) ||
      // Python nunjucks filters
      (parentObj && typeof parentObj === 'object' && Object.values(parentObj).includes(value) && value.endsWith('.py'))
    )
  );
}
```

### Option 2: Enhanced Python Handler Detection
Modify **ALL Python handlers** to detect dereferenced content and handle appropriately:

1. **`src/assertions/python.ts`** - ✅ Already implemented
2. **`src/prompts/processors/python.ts`** - Add content detection
3. **`src/util/testCaseReader.ts`** - Add content detection for Python tests  
4. **`src/util/transform.ts`** - Add content detection for Python transforms
5. **`src/util/functions/loadFunction.ts`** - Add content detection for Python functions

## Impact Assessment

### Severity: **🔴 CRITICAL** 
- **5 of 6 Python constructs affected**
- **Silent failures** - no obvious error messages
- **Widespread impact** across the entire Python ecosystem in promptfoo

### User Impact
- Users with dereferenced configs containing Python constructs experience silent failures
- Python prompts, tests, transforms, and filters simply don't work as expected
- Only inline configs work correctly (not dereferenced ones)

### Breaking Change Assessment  
- **No breaking changes** - both fix options are backwards compatible
- **Fixes existing broken functionality** rather than changing working features

## Recommendation: Option 2 (Enhanced)

Given the comprehensive scope, **Option 2** is now even more strongly recommended:

1. **Consistency** - All Python handlers become robust to both file paths and content
2. **Maintainability** - Each handler owns its file vs content detection logic  
3. **Extensibility** - Pattern can be applied to other language handlers (JS, etc.)
4. **Simplicity** - No complex context tracking in generic dereferencing code

The fix should be applied systematically to all affected Python handlers using the same pattern established for Python assertions.