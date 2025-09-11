# Task: Fix Issue #5519 - Python Assertion File References Loaded as Inline Code

## 1. Issue Description & Analysis

**GitHub Issue**: https://github.com/promptfoo/promptfoo/issues/5519

When `promptfooconfig.yaml` references an external test file (e.g., `file://tests.yaml`), which in turn references a Python assertion file (e.g., `file://assertion.py`), a bug in the config loader causes the Python file's content to be loaded as inline text.

This breaks the assertion mechanism. The system no longer sees a file reference to be executed with its `get_assert()` function. Instead, it sees a block of raw Python code, which it then wraps inside a `main()` function for execution. This leads to inverted outcomes: tests that should pass instead fail because `get_assert()` is never called, and tests with invalid top-level `return` statements pass because the `return` becomes valid inside the generated `main()` function.

This behavior is specific to the YAML test loading pathway. Referencing tests via a JSON file (e.g., `tests.json`) does not trigger the same aggressive dereferencing, and those configurations work as expected.

## 2. Root Cause Analysis

The issue stems from **premature and overly aggressive dereferencing** of `file://` paths during the initial configuration loading phase.

**Call Flow Investigation:**

1.  **Test YAML Loading**: In `src/util/testCaseReader.ts`, `maybeLoadConfigFromExternalFile(rawData)` is called on the content of the YAML test file.
2.  **Recursive Processing**: In `src/util/file.ts`, `maybeLoadConfigFromExternalFile` recursively walks the entire configuration object and calls `maybeLoadFromExternalFile()` on all string values.
3.  **Incorrect File Inlining**: `maybeLoadFromExternalFile` finds `value: 'file://assertion.py'`. Because there is no `:function_name` suffix, the current logic does not preserve it as a file reference. Instead, it reads the content of `assertion.py` and replaces the `file://` string with the raw text of the script.
4.  **Assertion Execution**: The assertion system receives what it believes to be an inline script and processes it incorrectly.

## 3. Impact Analysis

The bug critically affects users who structure their tests across multiple YAML files. A risk assessment was performed to determine the safest solution.

| Use Case | Path | Impact |
|----------|------|--------|
| **Assertions (YAML)** | `maybeLoadConfigFromExternalFile` | 🔴 **BROKEN** - Issue #5519 |
| **Providers** | `parsePathOrGlob` directly | ✅ **WORKING** - Not affected |
| **Prompts** | `parsePathOrGlob` directly | ✅ **WORKING** - Not affected |
| **Extension Hooks** | `maybeLoadConfigFromExternalFile` | ⚠️ **POTENTIAL** - Risk of breakage with a blanket fix |
| **Red Team Strategies**| `maybeLoadConfigFromExternalFile` | ⚠️ **POTENTIAL** - Risk of breakage with a blanket fix |

**Conclusion**: A surgical fix targeting only the assertion context is required to avoid breaking other potentially fragile use cases like extension hooks.

## 4. Proposed Solutions

### Option 1: Context-Aware Fix (Recommended)

**Approach**: Modify `maybeLoadFromExternalFile` to be context-aware. It will preserve `file://` references for Python/JS files *only when* it knows it is processing an assertion.

- **Pros**:
    - ✅ **Low Risk**: Surgically targets the exact problem without affecting other parts of the application.
    - ✅ **Preserves Existing Behavior**: Guarantees that extension hooks and other features that might rely on the current file-loading behavior are not broken.
- **Cons**:
    - ❌ **Medium Complexity**: Requires adding and threading a `context` parameter through the recursive loading functions.

### Option 2: Blanket Python/JS Preservation (Rejected)

**Approach**: Modify `maybeLoadFromExternalFile` to *always* preserve `file://` references for any Python/JS file, regardless of context.

- **Pros**:
    - ✅ **Simple Implementation**: Requires a simple, one-line logic change.
- **Cons**:
    - ❌ **High Risk**: The Impact Analysis shows this could break extension hooks, red team strategies, or other unknown use cases that rely on the current behavior. The risk of unintended side effects is too high.

**Decision**: Option 1 is the clear choice. Its surgical nature minimizes risk and ensures stability across the application.

## 5. Implementation Plan

### Phase 1: Context-Aware Fix

1.  **Modify Function Signatures**:
    - In `src/util/file.ts`, update `maybeLoadConfigFromExternalFile` and `maybeLoadFromExternalFile` to accept an optional context parameter:
      ```typescript
      function maybeLoadFromExternalFile(
        filePath: string | object | Function | undefined | null,
        context?: 'assertion' | 'general'
      )
      ```
      ```typescript
      function maybeLoadConfigFromExternalFile(
        config: any,
        context?: 'assertion' | 'general'
      ): any
      ```

2.  **Update Call Sites**:
    - Identify where assertions are loaded (likely in `src/util/testCaseReader.ts`) and pass the `'assertion'` context when calling `maybeLoadConfigFromExternalFile`.
    - Ensure all other call sites default to the `'general'` context to maintain existing behavior.

3.  **Add Preservation Logic**:
    - In `src/util/file.ts`, add the context-aware logic to `maybeLoadFromExternalFile`. This should be placed *after* parsing the path but *before* any file system access.
      ```typescript
      // In assertion contexts, always preserve Python/JS file references
      if (context === 'assertion' && (cleanPath.endsWith('.py') || isJavascriptFile(cleanPath))) {
        return renderedFilePath; // Preserve original file:// string
      }
      ```

### Phase 2: Implementation Guidance

- **Windows Paths**: Ensure the logic correctly handles Windows drive letters (e.g., `C:\...`) and does not misinterpret the drive-letter colon as a function separator. The existing `parseFileUrl` utility should already handle this.
- **JS Extensions**: Use the shared `isJavascriptFile` helper to detect JavaScript files to keep extension support consistent (`.js`, `.ts`, `.mjs`, etc.).
- **Glob Handling**: The refactor will change the variable used by the glob-detection logic. Ensure glob expansion for data files (e.g., `file://*.csv`) is not regressed.

## 6. Testing Strategy

1.  **Unit Tests (`test/util/file.test.ts`)**:
    - Test that `maybeLoadFromExternalFile('file://assert.py', 'assertion')` returns the original string.
    - Test that `maybeLoadFromExternalFile('file://script.py', 'general')` continues to load the file content as a string.
    - Test that `maybeLoadConfigFromExternalFile({ assert: ... }, 'assertion')` correctly preserves the `value` string within the object.

2.  **Integration Test**:
    - Add a test that loads a YAML-shaped object with a `file://...py` assertion and asserts that the config loading process does not throw and that the `value` field remains unchanged. This directly captures the original failure path.
    - Add a regression test for glob expansion (e.g., `file://*.yaml`) to ensure it was not affected by the refactor.

3.  **End-to-End Test**:
    - Implement the exact reproduction case from the GitHub issue and verify that the "Should PASS" test now passes and calls `get_assert`, and the "Should FAIL" test now fails with a `SyntaxError`.

4.  **Negative Test Case**:
    - Consider adding a test to clarify the behavior of a glob pattern combined with a function reference (e.g., `file://*.py:get_assert`). The expected behavior is likely to preserve the string and error out later, but this should be confirmed.

## 7. Documentation & Maintenance

1.  **CHANGELOG**: Add an entry documenting that a regression in YAML test loading for Python assertions has been fixed.
2.  **User Docs**: Consider adding a note to the documentation clarifying that `file://...` references for `.py` and `.js` files in assertions are treated as executable modules, not as content to be included.

## 8. Quick Workarounds (For Users)

Until this fix is released, affected users can use the following workarounds:
- Move tests from the external YAML file to be inline within `promptfooconfig.yaml`.
- Use a JSON file for tests (`tests.json`) instead of YAML, as the JSON loading path is not affected.
- Pin `promptfoo` to a version prior to `0.118.3`.
