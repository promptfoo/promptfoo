# validate_and_run_code_e2b.py
import json
import os
import re
import time

from e2b_code_interpreter import Sandbox
from metrics import write_metrics

# Robust fenced code regex
FENCE_RE = re.compile(r"```(?:\s*python)?\s*\r?\n(.*?)```", re.DOTALL | re.IGNORECASE)

# Unsafe patterns: pre-exec static scanner
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


def is_unsafe(code: str) -> bool:
    for p in UNSAFE_PATTERNS:
        if re.search(p, code):
            return True
    return False


def _extract_function(output: str, fn_name: str) -> str | None:
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


def _try_parse_logs_obj(logs_obj):
    """Try multiple ways to extract stdout/stderr from logs object or string."""
    if isinstance(logs_obj, (dict, list)):
        if isinstance(logs_obj, dict) and "stdout" in logs_obj:
            out = logs_obj.get("stdout")
            err = logs_obj.get("stderr", "")
            if isinstance(out, list):
                out = "".join(map(str, out))
            if isinstance(err, list):
                err = "".join(map(str, err))
            return str(out).strip(), str(err).strip()
        if isinstance(logs_obj, list):
            outs, errs = [], []
            for it in logs_obj:
                if isinstance(it, dict):
                    if it.get("stdout"):
                        outs.append(it.get("stdout"))
                    if it.get("stderr"):
                        errs.append(it.get("stderr"))
            if outs or errs:
                outs = "".join(map(str, outs))
                errs = "".join(map(str, errs))
                return str(outs).strip(), str(errs).strip()

    if hasattr(logs_obj, "to_json"):
        try:
            j = logs_obj.to_json()
            return _try_parse_logs_obj(j)
        except Exception:
            pass

    if hasattr(logs_obj, "stdout") or hasattr(logs_obj, "stderr"):
        try:
            out = getattr(logs_obj, "stdout", "")
            err = getattr(logs_obj, "stderr", "")
            if isinstance(out, list):
                out = "".join(map(str, out))
            if isinstance(err, list):
                err = "".join(map(str, err))
            return str(out).strip(), str(err).strip()
        except Exception:
            pass

    if isinstance(logs_obj, str):
        try:
            parsed = json.loads(logs_obj)
            return _try_parse_logs_obj(parsed)
        except Exception:
            m = re.search(r"stdout:\s*\[([^\]]*)\]", logs_obj)
            if m:
                inner = m.group(1).strip()
                items = re.findall(r"'(.*?)'|\"(.*?)\"", inner)
                strs = []
                for a, b in items:
                    if a:
                        strs.append(a)
                    elif b:
                        strs.append(b)
                out = "".join(strs)
                return out.strip(), ""
    return "", ""


def _stdout_from_result(res) -> tuple[str, str]:
    if hasattr(res, "results") and res.results:
        try:
            first = res.results[0]
            if isinstance(first, dict):
                out = (
                    first.get("stdout")
                    or first.get("output")
                    or first.get("text")
                    or ""
                )
                err = first.get("stderr") or ""
                if isinstance(out, list):
                    out = "".join(map(str, out))
                if isinstance(err, list):
                    err = "".join(map(str, err))
                if out or err:
                    return str(out).strip(), str(err).strip()
        except Exception:
            pass

    logs_field = getattr(res, "logs", None)
    if logs_field is not None:
        out, err = _try_parse_logs_obj(logs_field)
        if out or err:
            return out, err

    if getattr(res, "text", None):
        return str(res.text).strip(), ""

    if hasattr(res, "to_json"):
        try:
            j = res.to_json()
            return _try_parse_logs_obj(j)
        except Exception:
            pass

    return "", ""


def _run_code_in_sandbox(sbx, code: str):
    """Try a few run_code signatures safely (SDKs vary)."""
    # Preferred: named args (limits, disable network)
    try:
        return sbx.run_code(
            code=code,
            language="python",
            limits={"cputime": 1, "wall_time": 5, "memory": 128},
            allow_network=False,
        )
    except TypeError:
        pass
    except Exception:
        pass
    # Try alternate signatures
    try:
        return sbx.run_code(
            code, "python", {"cputime": 1, "wall_time": 5, "memory": 128}
        )
    except Exception:
        pass
    # Last resort
    return sbx.run_code(code)


def get_assert(output, context):
    task_id = context.get("id", str(time.time()))
    provider = context.get("provider", "unknown")
    model = context.get("model", "unknown")

    fn_name = context["vars"]["function_name"]
    test_input = context["vars"]["test_input"]
    expected = str(context["vars"]["expected_output"])

    function_code = _extract_function(output, fn_name)
    if not function_code:
        snippet = output.strip()[:300].replace("\n", " ")
        write_metrics(
            task_id, provider, model, False, 0.0, extra={"reason": "no_code_found"}
        )
        return {
            "pass": False,
            "score": 0,
            "reason": f"No Python code block found (first 300 chars: {snippet})",
        }

    # Pre-exec safety
    if is_unsafe(function_code):
        write_metrics(
            task_id, provider, model, False, 0.0, extra={"reason": "unsafe_pattern"}
        )
        return {
            "pass": False,
            "score": 0,
            "reason": "Unsafe pattern detected in generated code",
        }

    test_program = f"""{function_code}

print({fn_name}({test_input}))
"""

    start = time.time()
    with Sandbox.create() as sbx:
        try:
            res = _run_code_in_sandbox(sbx, test_program)
        except Exception as e:
            duration = time.time() - start
            write_metrics(
                task_id, provider, model, False, duration, extra={"error": str(e)}
            )
            return {
                "pass": False,
                "score": 0,
                "reason": f"Sandbox execution error: {e}",
            }

    duration = time.time() - start
    stdout, stderr = _stdout_from_result(res)
    err_obj = getattr(res, "error", None)

    if err_obj or stderr:
        dbg = ""
        try:
            dbg = (
                getattr(res, "to_json")()
                if hasattr(res, "to_json")
                else str(getattr(res, "logs", ""))[:800]
            )
        except Exception:
            dbg = str(getattr(res, "logs", ""))[:800]
        write_metrics(
            task_id,
            provider,
            model,
            False,
            duration,
            extra={"error": err_obj or stderr, "debug": dbg},
        )
        return {
            "pass": False,
            "score": 0,
            "reason": f"Execution error: {err_obj or stderr} | debug: {dbg}",
        }

    success = stdout == expected
    write_metrics(
        task_id, provider, model, success, duration, extra={"stdout": stdout[:500]}
    )
    if success:
        return {"pass": True, "score": 1, "reason": f"Correct output: {stdout}"}
    logs_preview = getattr(res, "logs", None)
    if isinstance(logs_preview, str) and len(logs_preview) > 400:
        logs_preview = logs_preview[:400] + "...(truncated)"
    return {
        "pass": False,
        "score": 0,
        "reason": f"Expected {expected}, got {stdout or '(empty)'} | logs: {logs_preview}",
    }
