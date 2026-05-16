"""Promptfoo provider that orchestrates inspect_evals' OSWorld task.

This is intentionally wrapper-shaped: Inspect owns the computer-use agent loop,
Docker sandbox, screenshots, tool calls, and OSWorld scorer. Promptfoo starts one
Inspect eval, dumps the Inspect `.eval` log to JSON, and exposes the final score.

Observed `inspect log dump` shape with Inspect 0.3.213:
  data["results"]["scores"][0]["metrics"]["accuracy"]["value"] -> aggregate pass rate
  data["samples"][0]["scores"][<scorer_name>]["value"] -> per-sample score
  data["samples"][0]["output"]["completion"] -> final assistant text when present
  data["stats"]["model_usage"][<model>] -> token counts
"""

from __future__ import annotations

import json
import os
import shlex
import shutil
import subprocess
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_MODEL = "openai/gpt-5.5"
DEFAULT_TIMEOUT_SECONDS = 1800
DEFAULT_TASK = "inspect_evals/osworld_small"
OSWORLD_SCORER = "osworld_scorer"


def call_api(prompt: str, options: dict, context: dict) -> dict:
    """Run one OSWorld sample through inspect_evals and return Promptfoo output."""
    del prompt
    config = options.get("config") or {}
    vars_ = context.get("vars") or {}
    requested_sample_id = vars_.get("sample_id")
    app = vars_.get("app")
    if not requested_sample_id:
        return {
            "error": (
                "OSWorld sample_id is required. Use osworld_tests.py or set "
                "vars.sample_id."
            )
        }

    model = vars_.get("model") or config.get("defaultModel") or DEFAULT_MODEL
    timeout_seconds = _int_config(config.get("timeoutSeconds"), DEFAULT_TIMEOUT_SECONDS)
    base_path = _resolve_base_path(config)
    log_root = _resolve_log_root(config, base_path)
    log_dir = _new_log_dir(log_root, str(app or requested_sample_id))
    inspect_cmd = _inspect_command(config)
    if not inspect_cmd:
        return {
            "error": (
                "Inspect CLI command is empty. Set providers[0].config.inspectCommand "
                "or PROMPTFOO_OSWORLD_INSPECT_COMMAND."
            )
        }

    task = config.get("task") or DEFAULT_TASK
    task_parameters = _task_parameters(config.get("taskParameters"))

    eval_cmd = [
        *inspect_cmd,
        "eval",
        task,
        *task_parameters,
        "--model",
        str(model),
        "--log-dir",
        str(log_dir),
        "--sample-id",
        str(requested_sample_id),
    ]

    started = time.monotonic()
    try:
        eval_result = subprocess.run(
            eval_cmd,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            cwd=str(base_path),
        )
    except FileNotFoundError:
        return {"error": _missing_inspect_message(inspect_cmd[0])}
    except subprocess.TimeoutExpired:
        return {
            "error": (
                f"Inspect OSWorld run timed out after {timeout_seconds}s. "
                "Increase providers[0].config.timeoutSeconds for real runs."
            ),
            "metadata": {
                "inspect_log_path": str(log_dir),
                "status": "error",
                "duration_seconds": round(time.monotonic() - started, 3),
            },
        }

    duration = time.monotonic() - started
    if eval_result.returncode != 0:
        return {
            "error": _humanize_inspect_failure(eval_result),
            "metadata": {
                "inspect_log_path": str(log_dir),
                "status": "error",
                "duration_seconds": round(duration, 3),
            },
        }

    eval_log = _find_eval_log(log_dir)
    if eval_log is None:
        return {
            "error": f"Inspect completed but no .eval log was found in {log_dir}.",
            "metadata": {"inspect_log_path": str(log_dir), "status": "error"},
        }

    dump_cmd = [*inspect_cmd, "log", "dump", str(eval_log)]
    try:
        dump_result = subprocess.run(
            dump_cmd,
            check=False,
            capture_output=True,
            text=True,
            timeout=300,
            cwd=str(base_path),
        )
    except FileNotFoundError:
        return {"error": _missing_inspect_message(inspect_cmd[0])}
    except subprocess.TimeoutExpired:
        return {
            "error": f"Timed out while dumping Inspect log {eval_log} to JSON.",
            "metadata": {"inspect_log_path": str(eval_log), "status": "error"},
        }

    if dump_result.returncode != 0:
        return {
            "error": _humanize_log_dump_failure(dump_result, eval_log),
            "metadata": {"inspect_log_path": str(eval_log), "status": "error"},
        }

    try:
        log_json = json.loads(dump_result.stdout)
    except json.JSONDecodeError as exc:
        return {
            "error": f"Could not parse Inspect log dump JSON for {eval_log}: {exc}",
            "metadata": {"inspect_log_path": str(eval_log), "status": "error"},
        }

    parsed = _parse_inspect_log(log_json)
    parsed_sample_id = parsed.get("sample_id")
    sample_id = parsed_sample_id or "unknown sample"
    if parsed_sample_id and sample_id != str(requested_sample_id):
        return {
            "error": (
                f"Inspect returned sample {sample_id}, but Promptfoo requested "
                f"{requested_sample_id}."
            ),
            "metadata": {
                "inspect_log_path": str(eval_log),
                "status": "error",
                "sample_id": sample_id,
                "requested_sample_id": str(requested_sample_id),
                "duration_seconds": round(duration, 3),
                "task": task,
                "app": str(app or "unknown"),
            },
        }

    score = parsed.get("score")
    status = "pass" if isinstance(score, (int, float)) and score >= 1.0 else "fail"
    metadata = {
        "inspect_log_path": str(eval_log),
        "score": score,
        "status": status,
        "sample_id": sample_id,
        "model": str(model),
        "num_messages": parsed.get("num_messages", 0),
        "duration_seconds": round(duration, 3),
        "task": task,
        "app": str(app or "unknown"),
        "requested_sample_id": str(requested_sample_id),
    }
    token_usage = parsed.get("token_usage")

    inspect_error = _inspect_log_error(parsed)
    if inspect_error:
        metadata["status"] = "error"
        metadata["inspect_status"] = parsed.get("inspect_status")
        metadata["inspect_error"] = inspect_error
        result: dict[str, Any] = {
            "error": (
                f"Inspect OSWorld run did not produce a score for sample {sample_id}: "
                f"{inspect_error}"
            ),
            "metadata": metadata,
        }
        if token_usage:
            result["tokenUsage"] = token_usage
        return result

    final_answer = (
        parsed.get("final_answer") or "(no final assistant text found in Inspect log)"
    )
    output = (
        f"Sample {sample_id} on app {app or 'unknown'}: "
        f"score={score if score is not None else 'unknown'} "
        f"status={status}\n\nFinal answer: {final_answer}"
    )

    result: dict[str, Any] = {"output": output, "metadata": metadata}
    if token_usage:
        result["tokenUsage"] = token_usage
    return result


def _inspect_command(config: dict) -> list[str]:
    env_command = os.environ.get("PROMPTFOO_OSWORLD_INSPECT_COMMAND")
    command = config.get("inspectCommand") or env_command or "inspect"
    if isinstance(command, list):
        return [str(part) for part in command]
    return shlex.split(str(command))


def _task_parameters(configured: Any) -> list[str]:
    if not isinstance(configured, dict):
        return []

    parameters: list[str] = []
    for key, value in configured.items():
        if value is None:
            continue
        parameters.extend(["-T", f"{key}={_format_task_parameter_value(value)}"])
    return parameters


def _format_task_parameter_value(value: Any) -> str:
    if isinstance(value, bool):
        return str(value).lower()
    return str(value)


def _resolve_base_path(config: dict) -> Path:
    configured = config.get("basePath")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parent


def _resolve_log_root(config: dict, base_path: Path) -> Path:
    configured = config.get("logRoot")
    path = Path(configured).expanduser() if configured else base_path / "inspect_logs"
    if not path.is_absolute():
        path = base_path / path
    return path.resolve()


def _new_log_dir(log_root: Path, app: str) -> Path:
    safe_app = "".join(ch if ch.isalnum() or ch in ("-", "_") else "-" for ch in app)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = log_root / f"{stamp}-{safe_app}-{os.getpid()}-{uuid.uuid4().hex[:8]}"
    path.mkdir(parents=True, exist_ok=False)
    return path


def _find_eval_log(log_dir: Path) -> Path | None:
    logs = sorted(
        log_dir.rglob("*.eval"), key=lambda path: path.stat().st_mtime, reverse=True
    )
    return logs[0] if logs else None


def _parse_inspect_log(data: dict[str, Any]) -> dict[str, Any]:
    samples = data.get("samples") or []
    sample = samples[0] if samples else {}
    sample_score, score_error = _sample_score(sample) if sample else (None, None)
    score = None if score_error else sample_score
    return {
        "score": score,
        "score_error": score_error,
        "sample_id": sample.get("id") or sample.get("uuid"),
        "final_answer": _final_answer(sample),
        "num_messages": len(sample.get("messages") or []),
        "token_usage": _token_usage(data, sample),
        "inspect_status": data.get("status"),
        "sample_error": sample.get("error"),
    }


def _sample_score(sample: dict[str, Any]) -> tuple[float | None, str | None]:
    scores = sample.get("scores") or {}
    preferred_score = scores.get(OSWORLD_SCORER)
    if preferred_score is not None:
        numeric = _score_value(preferred_score)
        if numeric is not None:
            return numeric, None
        return (
            None,
            f"Inspect recorded {OSWORLD_SCORER}, but its value was not numeric.",
        )

    if scores:
        return (
            None,
            f"Inspect did not record {OSWORLD_SCORER} for the selected sample.",
        )
    return None, None


def _score_value(score: Any) -> float | None:
    if not isinstance(score, dict):
        return None
    return _coerce_score(score.get("value"))


def _coerce_score(value: Any) -> float | None:
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        normalized = value.strip().upper()
        if normalized == "C":
            return 1.0
        if normalized == "I":
            return 0.0
        try:
            return float(value)
        except ValueError:
            return None
    return None


def _final_answer(sample: dict[str, Any]) -> str | None:
    output = sample.get("output") or {}
    completion = output.get("completion")
    if isinstance(completion, str) and completion.strip():
        return completion.strip()

    for message in reversed(sample.get("messages") or []):
        if message.get("role") == "assistant":
            content = message.get("content")
            if isinstance(content, str) and content.strip():
                return content.strip()
    return None


def _token_usage(data: dict[str, Any], sample: dict[str, Any]) -> dict[str, int] | None:
    usage_sources = [
        sample.get("model_usage"),
        (data.get("stats") or {}).get("model_usage"),
    ]
    totals = {"prompt": 0, "completion": 0, "total": 0}
    found = False
    for usage_by_model in usage_sources:
        if not isinstance(usage_by_model, dict):
            continue
        for usage in usage_by_model.values():
            if not isinstance(usage, dict):
                continue
            totals["prompt"] += int(
                usage.get("input_tokens") or usage.get("prompt_tokens") or 0
            )
            totals["completion"] += int(
                usage.get("output_tokens") or usage.get("completion_tokens") or 0
            )
            totals["total"] += int(usage.get("total_tokens") or 0)
            found = True
        if found:
            break
    if found and totals["total"] == 0:
        totals["total"] = totals["prompt"] + totals["completion"]
    return totals if found else None


def _inspect_log_error(parsed: dict[str, Any]) -> str | None:
    score_error = parsed.get("score_error")
    if score_error:
        return str(score_error)

    sample_error = parsed.get("sample_error")
    if isinstance(sample_error, dict):
        message = sample_error.get("message") or sample_error.get("traceback")
        if message:
            return _summarize_inspect_error(str(message))
    elif sample_error:
        return _summarize_inspect_error(str(sample_error))

    if parsed.get("inspect_status") == "error":
        return "Inspect log status is error and no scorer result was recorded."

    if parsed.get("score") is None:
        sample_id = parsed.get("sample_id")
        if sample_id:
            return (
                f"Inspect completed sample {sample_id}, but no OSWorld scorer result "
                "was recorded."
            )
        return (
            "Inspect completed, but selected zero samples or recorded no scorer result. "
            "Check vars.sample_id."
        )

    return None


def _summarize_inspect_error(message: str) -> str:
    if "Failure executing command:" in message:
        return (
            "Inspect computer tool failed while executing a model-requested desktop "
            "command. See the Inspect log for the full traceback and command output."
        )

    if "image_original.png" in message:
        return (
            "OSWorld scorer could not read an expected image artifact. See the Inspect "
            "log for the full traceback."
        )

    if "'OSWorldDesktopEnv' object has no attribute 'vm_ip'" in message:
        return (
            "OSWorld scorer could not read VLC desktop state. See the Inspect log for "
            "the full traceback."
        )

    return "Inspect reported an unscored sample error. See the Inspect log for details."


def _int_config(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _missing_inspect_message(command: str) -> str:
    if shutil.which(command) is None:
        return (
            f"Could not find Inspect CLI command '{command}'. Install prerequisites with "
            "`pip install 'inspect-evals[osworld]' openai anthropic` or set "
            "providers[0].config.inspectCommand."
        )
    return f"Could not execute Inspect CLI command '{command}'."


def _humanize_inspect_failure(result: subprocess.CompletedProcess) -> str:
    tail = _tail(result.stderr) or _tail(result.stdout) or "(no output)"
    hint = ""
    lowered = tail.lower()
    if "specified dataset is empty" in lowered or "no samples" in lowered:
        hint = " Check vars.sample_id. Inspect selected no OSWorld samples for this id."
    elif "docker compose" in lowered or "compose" in lowered:
        hint = " Check that Docker Compose V2 is installed and available as `docker compose`."
    elif "docker" in lowered:
        hint = " Check that Docker is installed, running, and usable by your user."
    elif "requires optional dependencies" in lowered:
        hint = " Install the selected Inspect model provider SDK, such as `openai` or `anthropic`."
    elif "api_key" in lowered or "api key" in lowered or "authentication" in lowered:
        hint = " Check that the selected model provider API key is exported."
    elif "model" in lowered:
        hint = " Check providers[0].config.defaultModel or vars.model."
    return f"Inspect eval failed with exit code {result.returncode}.{hint}"


def _humanize_log_dump_failure(
    result: subprocess.CompletedProcess, eval_log: Path
) -> str:
    return f"Inspect log dump failed for {eval_log} with exit code {result.returncode}."


def _tail(text: Any, limit: int = 4000) -> str:
    if not text:
        return ""
    text = text.decode(errors="replace") if isinstance(text, bytes) else str(text)
    return text[-limit:]
