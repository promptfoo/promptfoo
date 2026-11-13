"""Grade generated Python in an E2B sandbox with outbound internet disabled."""

import re
import time

from e2b_code_interpreter import Sandbox
from metrics import write_metrics

FENCE_RE = re.compile(r"```(?:\s*python)?\s*\r?\n(.*?)```", re.DOTALL | re.IGNORECASE)

# This illustrative precheck is not a security boundary. Generated code executes
# in an E2B sandbox, never in the local Python process.
UNSAFE_PATTERNS = [
    r"\bimport\s+socket\b",
    r"\bimport\s+requests\b",
    r"\bimport\s+urllib\b",
    r"\bos\.system\b",
    r"\bsubprocess\b",
    r"\beval\s*\(",
    r"\bexec\s*\(",
    r"open\(\s*['\"]\/etc",
    r"open\(\s*['\"]\/proc",
    r"__import__\(",
]
SANDBOX_TIMEOUT_SECONDS = 60
EXECUTION_TIMEOUT_SECONDS = 5


def is_unsafe(code: str) -> bool:
    return any(re.search(pattern, code) for pattern in UNSAFE_PATTERNS)


def _extract_function(output: str, fn_name: str) -> str | None:
    """Extract the generated function from fenced code or plain text output."""
    m = FENCE_RE.search(output)
    if m:
        return m.group(1).strip()

    by_name = re.search(
        rf"(def\s+{re.escape(fn_name)}\s*\(.*?\)\s*:[\s\S]*?)(?=\n\s*\n|^```|^class\s+|^def\s+)",
        output,
        re.IGNORECASE | re.MULTILINE,
    )
    if by_name:
        return by_name.group(1).strip()

    any_def = re.search(r"(def\s+\w+\s*\(.*?\)\s*:[\s\S]*)", output)
    if any_def:
        return any_def.group(1).strip()
    return None


def get_assert(output, context):
    task_id = context.get("id", str(time.time()))
    provider = context.get("provider", "unknown")
    if isinstance(provider, dict):
        provider = provider.get("label") or provider.get("id") or "unknown"
    model = context.get("model", "unknown")
    variables = context["vars"]
    started = time.monotonic()

    def result(passed, reason):
        write_metrics(
            task_id,
            provider,
            model,
            passed,
            time.monotonic() - started,
            extra={"reason": reason},
        )
        return {"pass": passed, "score": int(passed), "reason": reason}

    function_name = variables["function_name"]
    code = _extract_function(output, function_name)
    if not code:
        return result(False, f"No Python function named {function_name} found")
    if is_unsafe(code):
        return result(False, "Unsafe pattern detected in generated code")

    program = f"{code}\n\nprint({function_name}({variables['test_input']}))\n"
    try:
        # E2B's SDK accepts internet policy when creating the sandbox, and an
        # execution timeout on run_code. CPU/memory limits are template settings,
        # not run_code parameters. Never retry with weaker settings on failure.
        with Sandbox.create(
            allow_internet_access=False, timeout=SANDBOX_TIMEOUT_SECONDS
        ) as sandbox:
            execution = sandbox.run_code(
                program, language="python", timeout=EXECUTION_TIMEOUT_SECONDS
            )
    except Exception as error:
        return result(False, f"Sandbox execution error: {error}")

    expected_error = variables.get("expected_error")
    if execution.error:
        error = execution.error
        if expected_error and error.name == expected_error:
            return result(True, f"Expected error: {error.name}")
        return result(False, f"Execution error: {error.name}: {error.value}")
    if expected_error:
        return result(False, f"Expected {expected_error}, but execution succeeded")

    stdout = "".join(execution.logs.stdout).strip()
    expected = str(variables["expected_output"])
    if stdout == expected:
        return result(True, f"Correct output: {stdout}")
    return result(False, f"Expected {expected}, got {stdout or '(empty)'}")
