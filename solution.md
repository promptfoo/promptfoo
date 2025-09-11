# Triage: Python assertion files dereferenced as inline code when tests are loaded from YAML

## 1) Problem Analysis

- Reported behavior:
  - When `promptfooconfig.yaml` references an external tests file (e.g., `tests.yaml`) and that YAML contains assertions with `value: file://good_assertion.py`, promptfoo loads the referenced Python file’s contents into the config as inline text during config processing.
  - Later, during assertion evaluation, because the Python is now inlined (plain code text) rather than a `file://...` reference, promptfoo treats it as inline Python and wraps it inside a generated `main` function instead of calling the external file’s `get_assert` function.
  - This flips the intended behavior: a file designed to expose `get_assert` is treated as inline assertion code.

- Expected behavior:
  - When `value: file://good_assertion.py` is used, the assertion engine should run the Python file as an external module and call `get_assert(output, context)` by default (or a specified function if `:function` suffix is provided).

- Provided example and outcomes:
  - “Should PASS” test (using `good_assertion.py` with `get_assert`) unexpectedly fails with:
    - `Python code execution failed: Python assertion must return a boolean, number, or {pass, score, reason} object. Got instead: {}`
  - “Should FAIL” test (using `bad_assertion.py` that has top-level `return`) unexpectedly passes because the file content is inlined under the generated `main` function, making `return` valid.

- System details (as reported):
  - promptfoo: 0.118.3
  - Node: v24.7.0
  - macOS arm64 24.6.0


## 2) Root Cause Investigation

Relevant code paths and logic:

- Test loading for YAML tests: `src/util/testCaseReader.ts`
  - YAML flow calls `yaml.load(...)` and then runs `maybeLoadConfigFromExternalFile(rawContent)` to recursively dereference `file://...` values found anywhere in the YAML structure.

- Generic dereferencing: `src/util/file.ts`
  - `maybeLoadConfigFromExternalFile` recurses into arrays/objects and calls `maybeLoadFromExternalFile` on strings.
  - `maybeLoadFromExternalFile`:
    - If a string starts with `file://`, it resolves the path and loads contents. For `.json`, `.yaml`, `.csv` it parses accordingly; otherwise it returns the raw file content as a string.
    - Crucially, `.py` files are not specially handled here, so Python file contents are read and substituted as a plain string.

- Assertion evaluation: `src/assertions/index.ts` → `runAssertion`
  - If the assertion value is a string that still starts with `file://` and ends in `.py`, it calls `runPython(filePath, functionName || 'get_assert', [output, context])` — the correct behavior.
  - If the value is a plain string (not starting with `file://`), it is treated as inline Python. `src/assertions/python.ts` then constructs a wrapper of the form:
    - `def main(output, context):\n    ... <inlined code> ...`
    - and executes `main(output, context)` via `runPythonCode`.

Why it fails when tests are in YAML:
- Because YAML tests are passed through the dereferencer, `value: file://good_assertion.py` is eagerly replaced with the contents of `good_assertion.py` (a string). The assertion engine no longer sees `file://...`; it sees inline code.
- For `good_assertion.py`, which defines `get_assert(...)`, the inlined code ends up as a nested function definition inside `main` that is never called — yielding `None` and causing a type/shape error.
- For `bad_assertion.py`, which has a top-level `return`, inlining places that `return` within `main`, making it valid and causing a pass.

Contrast with JSON tests:
- In `readStandaloneTestsFile`, when the tests file extension is `.json`, the loader returns parsed objects directly without passing them through `maybeLoadConfigFromExternalFile`. So `value: file://good_assertion.py` remains a string reference into the assertion phase and works as expected.

Conclusion:
- The root cause is over-eager, context-agnostic dereferencing of `file://...` values inside YAML tests, which converts Python file references into inline code strings before the assertion system can process them as external functions.


## 3) Potential Causes (complete list)

- Logic error: `maybeLoadConfigFromExternalFile` is used on YAML tests and blindly dereferences any `file://...` value, including `.py` files intended as executable modules.
- Missing special-case: The dereferencer does not recognize Python/JS code references that should be left for downstream loaders (assertions, function callbacks, providers) rather than being inlined.
- Inconsistent handling across formats: YAML tests go through dereferencing; JSON tests do not, creating inconsistent behavior.
- Ambiguous design for `.py` refs: No explicit rule determines whether `file://...py` should be treated as inline include vs. an executable function source; current usage expects “executable” semantics.
- Default function name dependency: Assertions depend on default `get_assert` when no `:function` suffix is provided; inlining bypasses this.
- Edge case interactions:
  - Windows drive letters with colons (handled elsewhere via last-colon logic).
  - Glob patterns in file paths (dereferencer may expand; assertions don’t support function refs with globs).
  - Nunjucks templating in file paths (still not the immediate cause here but present in path resolution).


## 4) Reproduction Steps

Minimal repro aligned with the report (keep exact semantics):

- Files
  - `promptfooconfig.yaml`
    ```yaml
    providers:
      - id: "python:./provider.py"
    tests:
      - file://tests.yaml
    ```
  - `provider.py`
    ```python
    def call_api(prompt, options, context):
        return {"output": "LLM output."}
    ```
  - `tests.yaml`
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
  - `good_assertion.py`
    ```python
    def get_assert(output, context):
      return {
        "pass": True,
        "score": 1,
        "reason": f"Assertion function 'get_assert' was called.",
      }
    ```
  - `bad_assertion.py`
    ```python
    import inspect
    return {
      "pass": True,
      "score": 1,
      "reason": f"Assertion function '{inspect.stack()[0][3]}' was called.",
    }
    ```

- Command
  ```bash
  promptfoo eval -c promptfooconfig.yaml
  ```

- Expected results
  - “Should PASS” passes (external function `get_assert` is called).
  - “Should FAIL” fails (top-level return should cause a syntax error if executed as a module; or at minimum should not silently pass).

- Actual results (0.118.3)
  - “Should PASS” fails: `Python code execution failed: Python assertion must return a boolean, number, or {pass, score, reason} object. Got instead: {}`
  - “Should FAIL” passes: because inline wrapping made the `return` valid.

Notes:
- The behavior diverges if tests are provided inline in `promptfooconfig.yaml` or via JSON tests. Those cases typically work because the dereferencer either doesn’t run or the value remains a `file://` string into the assertion phase.


## 5) Solution Exploration

Below are viable fixes with rationale, trade-offs, and side effects:

- Option A: Teach the dereferencer to preserve `.py`/JS `file://` references
  - Change `maybeLoadFromExternalFile` so that for `file://...` paths ending with `.py` or recognized JS extensions, it returns the original string (does not inline file contents), regardless of whether a `:function` suffix is present.
  - Rationale: Execution of code files should be decided by domain-specific loaders (assertions, tool callbacks, providers). The generic dereferencer should not inline code files.
  - Pros: Central, consistent rule; fixes both `file://good_assertion.py` and `file://good_assertion.py:get_assert` cases for YAML tests; also benefits other places where code refs appear.
  - Cons: If any config intentionally relied on inlining code files as plain text (rare and risky), that behavior would change — such cases should instead use an explicit mechanism for text includes.
  - Best practice: Keep generic loaders data-centric (JSON/YAML/CSV/text), and defer executable resources to specialized loaders.

- Option B: Schema-aware skip for assertion values
  - In `maybeLoadConfigFromExternalFile`, detect assertion objects (`{ type: 'python'|'javascript', value: 'file://...' }`) and skip dereferencing their `value` field.
  - Rationale: Minimal change focused on the failing path.
  - Pros: Surgical; doesn’t affect other consumers of `.py` references elsewhere.
  - Cons: Couples a low-level generic utility to assertion schema; easy to miss other places where code refs appear (e.g., function callbacks). Harder to maintain long term.

- Option C: Route `.py` refs through a dedicated file-reference loader
  - Introduce or reuse a helper similar to `src/util/fileReference.ts::loadFileReference` so that `file://...py` is resolved via `runPython` only at usage points, not at deref time. For the dereferencer, treat `.py` as non-dereferenceable (i.e., leave string as-is).
  - Rationale: Separation of concerns; avoids mixing content inclusion and executable modules.
  - Pros/Cons: Similar to Option A, but emphasizes consistent helper usage.

Recommended approach: Option A
- It’s the cleanest and most robust: the dereferencer remains for data files; code files remain references until a specialized loader handles them. This fixes both “default function name” and “explicit `:function`” cases in YAML tests and aligns behavior across config formats.

Additional safeguards and tests:
- Unit test: `maybeLoadConfigFromExternalFile` should preserve `value: 'file://good_assertion.py'` in a YAML-shaped assertion object.
- Integration test: Load YAML tests with `file://...py` references and ensure no “inline conversion” occurs; the assertion engine must call `get_assert`.
- Test Windows paths with drive letters and colons.
- Negative test: If someone tries `file://*.py:get_assert` (glob + function), ensure it’s rejected with a clear error downstream (or explicitly unsupported).

Migration/Docs:
- CHANGELOG entry: document the regression in 0.118.3 and the fix.
- Docs: Clarify that `.py`/JS `file://` references are executable references, not content includes; for including plain text, use appropriate non-code files or explicit include mechanisms.


## 6) Implementation Notes for the Fix (guidance only)

- Primary file(s): `src/util/file.ts` (generic dereferencer).
- Ensure any new logic accounts for:
  - `file://...:function` parsing (split on last colon; consider Windows drive letters).
  - JS extension detection via `isJavascriptFile` or a shared constant (avoid regex drift).
  - Glob handling remains unchanged for data files.
- Add tests in `test/util/file.test.ts` and an integration test that reads YAML tests with Python assertion references.
- Audit other callers of `maybeLoadConfigFromExternalFile` to confirm no unintended behavior change for `.py` references that truly need to be inlined (if any; likely none).


## 7) Quick Workarounds (until fix is released)

- Move tests inline into `promptfooconfig.yaml` instead of a separate YAML file.
- Use a JSON tests file instead of YAML; JSON tests are not dereferenced in a way that strips `file://...` for `.py`.
- Temporarily pin to a version prior to 0.118.3 if your workflow relies heavily on YAML tests with external Python assertions.


## 8) Conclusion

- Root cause: context-agnostic dereferencing of `file://...` values in YAML tests converts Python file references to inline code strings. This bypasses the assertion system’s external function execution and default `get_assert` resolution, leading to inverted pass/fail outcomes.
- Recommended fix: Preserve `.py`/JS `file://` references in the dereferencer (do not inline), allowing specialized loaders to execute them. Add targeted unit/integration tests and update docs/changelog.

