# Triage Report: Incorrect Handling of Nested External Python Assertions

## 1. Problem Analysis

A bug has been identified in how `promptfoo` processes nested external file references, specifically when a configuration file references a test file, which in turn references a Python assertion file.

### Observed Behavior

- **Setup**:
  - `promptfooconfig.yaml` references `file://tests.yaml`.
  - `tests.yaml` contains two test cases, each referencing a Python assertion script via `file://<assertion_file>.py`.
  - One assertion script (`good_assertion.py`) defines a `get_assert` function.
  - The other (`bad_assertion.py`) contains only top-level code, including a `return` statement.

- **Actual Outcome**:
  1.  The test using `good_assertion.py` (with the `get_assert` function) **fails**. The error indicates the Python assertion returned an empty object (`{}`), not the expected `{pass: true, ...}` object.
  2.  The test using `bad_assertion.py` (with the top-level `return`) **passes**. This is unexpected because a `return` statement outside a function should raise a `SyntaxError`. The assertion reason reveals that a function named `main` was executed.

### Expected Behavior

1.  The test using `good_assertion.py` should **pass**. The `get_assert` function should be found and executed.
2.  The test using `bad_assertion.py` should **fail** with a `SyntaxError: 'return' outside function` because the top-level `return` is invalid Python syntax.

## 2. Root Cause Investigation

The issue stems from the **premature and overly aggressive dereferencing** of `file://` paths during the initial configuration loading phase. The logic does not distinguish between file references meant for structural inclusion (like `tests: file://tests.yaml`) and file references that should be preserved as strings for later processing (like an assertion's `value`).

Here is the step-by-step breakdown of the failure:

1.  **Initial Load**: `promptfoo` starts by loading `promptfooconfig.yaml`.
2.  **First Dereference**: The `maybeLoadConfigFromExternalFile` utility is invoked. It sees `tests: file://tests.yaml` and correctly loads the content of `tests.yaml`, replacing the reference with the file's content.
3.  **Second (Incorrect) Dereference**: The utility then **recursively traverses the newly loaded content**. It finds the `assert` block with `value: file://good_assertion.py`. Instead of preserving this string, it *again* invokes `maybeLoadFromExternalFile`.
4.  **Content Inlining**: The function reads the raw text content of `good_assertion.py` and `bad_assertion.py` and **inlines it directly into the configuration object**.

At the end of the loading phase, the configuration passed to the test runner no longer contains the file path. It contains the raw Python code. For example:

```yaml
# This is the in-memory representation of the test after incorrect loading
- vars:
    name: Should PASS
  assert:
  - type: python
    value: |  # The file content is now inlined
      def get_assert(output, context):
        return {
          "pass": True,
          "score": 1,
          "reason": f"Assertion function 'get_assert' was called.",
        }
```

5.  **Assertion Execution**: When the assertion runner receives this test case, it inspects the `value`.
    - It does **not** see the `file://` prefix.
    - Therefore, it treats the `value` as an **inline Python script**.
    - The standard procedure for inline scripts is to wrap the entire code block inside a `def main(output, context):` function and then execute `main`.

This explains both observed behaviors:
- **`good_assertion.py` Failure**: The inlined code `def get_assert(...): ...` is wrapped, resulting in `def main(...): def get_assert(...): ...`. When `main` is called, it simply defines the `get_assert` function and then exits, returning `None`. `promptfoo` interprets this as an empty object (`{}`), causing the "must return a boolean, number, or object" failure. The `get_assert` function itself is never invoked.
- **`bad_assertion.py` Pass**: The inlined code `import inspect; return {...}` is wrapped, resulting in `def main(...): import inspect; return {...}`. This is now valid Python. When `main` is called, it executes the code and returns the expected dictionary, causing the test to pass. The `inspect` call correctly reports the function name as `main`.

The core of the bug is that the config loader modifies a value that it doesn't have the context for, breaking the contract that the assertion runner expects.

## 3. Potential Causes

- **Overly Aggressive Recursive Loading**: The primary cause is that `maybeLoadConfigFromExternalFile` recursively processes the entire configuration object, replacing any `file://` string it finds with the file's content, without regard for its semantic meaning.
- **Loss of Context**: The file loader lacks the context to know that `value` within an `assert` block is special and should be preserved as a string for the assertion runner to handle.
- **Brittle Convention**: The system relies on the `file://` prefix to distinguish between inline code and a file path reference. By prematurely removing this prefix and inlining the content, the loader erases this critical distinction.

## 4. Reproduction Steps

1.  **Create the following five files in a single directory:**

    **`promptfooconfig.yaml`**
    ```yaml
    providers:
      - id: "python:./provider.py"
    tests: file://tests.yaml
    ```

    **`provider.py`**
    ```python
    def call_api(prompt, options, context):
        return {"output": "LLM output."}
    ```

    **`tests.yaml`**
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

    **`good_assertion.py`**
    ```python
    def get_assert(output, context):
      return {
        "pass": True,
        "score": 1,
        "reason": f"Assertion function 'get_assert' was called.",
      }
    ```

    **`bad_assertion.py`**
    ```python
    import inspect
    return {
      "pass": True,
      "score": 1,
      "reason": f"Assertion function '{inspect.stack()[0][3]}' was called.",
    }
    ```

2.  **Run the evaluation command from that directory:**
    ```bash
    promptfoo eval -c promptfooconfig.yaml
    ```

3.  **Observe the output**, which will show the "Should PASS" test failing and the "Should FAIL" test passing, matching the buggy behavior.

## 5. Solution Exploration

The goal is to prevent the config loader from dereferencing `file://` paths that are intended for the assertion runner.

### Solution 1: Make the Config Loader Context-Aware (Recommended)

The most robust solution is to modify `maybeLoadConfigFromExternalFile` to be context-aware. When traversing the configuration object, it should avoid dereferencing `file://` strings if they are part of an assertion definition.

- **Rationale**: This approach fixes the problem at its source. It respects the separation of concerns: config loading is for structure, and assertion handling is for assertion-specific logic. By preventing the premature inlining, the `file://` string is preserved, and the assertion runner will correctly identify it as a file path and invoke `get_assert`.
- **Implementation**: The `maybeLoadConfigFromExternalFile` function should be updated. When it encounters a key-value pair, if the key is `value` and a sibling key `type` is `python` or `javascript`, it should not attempt to resolve the `value` as a file. It should leave the string as-is.
- **Trade-offs**: This adds a small amount of complexity to the config loader, making it aware of the `assert` structure. However, this is a reasonable trade-off for correctness and is less risky than other approaches.

### Solution 2: Use a Different Key for File Paths

A longer-term solution could be to change the configuration schema to remove the ambiguity of the `value` field.

- **Rationale**: Instead of overloading `value` to mean either "inline code" or "file path", use distinct keys. This makes the configuration more explicit and less prone to this kind of error.
- **Implementation**:
  ```yaml
  assert:
    - type: python
      filePath: file://good_assertion.py # New key
      # or
      # code: 'return { "pass": True }' # For inline
  ```
- **Trade-offs**: This is a **breaking change** for users and would require a major version bump and clear migration documentation. It is not suitable for a simple bug fix but is a good practice to consider for future architectural improvements.

### Solution 3: Heuristics in the Assertion Runner (Not Recommended)

The assertion runner could try to guess if an inline script was an incorrectly inlined file.

- **Rationale**: This would attempt to fix the problem downstream without touching the config loader.
- **Implementation**: If the assertion runner receives an inline script, it could check if the script content contains `def get_assert`. If so, it could try to execute that function instead of wrapping the code in `main`.
- **Trade-offs**: This is extremely brittle and based on heuristics. It would fail for valid inline scripts that happen to define a function with that name and would not solve the `bad_assertion.py` case. This approach is a hack and should be avoided.

**Recommendation**: **Solution 1** is the clear and correct path forward. It is a targeted fix that addresses the root cause with minimal side effects and respects the existing architecture.
