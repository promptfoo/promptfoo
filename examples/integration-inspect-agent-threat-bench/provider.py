"""Promptfoo provider that orchestrates Inspect's AgentThreatBench tasks.

Inspect owns AgentThreatBench's task prompts, simulated tools, tool loop, and
dual utility/security scorer. Promptfoo starts one Inspect eval per generated
test row, dumps the `.eval` log to JSON, and exposes both metric scores.
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

DEFAULT_MODEL = "openai/gpt-5-nano"
DEFAULT_TIMEOUT_SECONDS = 300
SCORER = "agent_threat_bench_scorer"
TASKS = ("memory_poison", "autonomy_hijack", "data_exfil")


def call_api(prompt: str, options: dict, context: dict) -> dict:
    """Run one AgentThreatBench sample through Inspect."""
    del prompt
    config = options.get("config") or {}
    vars_ = context.get("vars") or {}
    requested_sample_id = vars_.get("sample_id")
    task = _normalize_task(vars_.get("task"))
    if not requested_sample_id:
        return {
            "error": (
                "AgentThreatBench sample_id is required. Use "
                "agent_threat_bench_tests.py or set vars.sample_id."
            )
        }
    if task is None:
        return {
            "error": (
                "AgentThreatBench task must be one of: "
                f"{', '.join(TASKS)}. Use agent_threat_bench_tests.py or set vars.task."
            )
        }

    model = vars_.get("model") or config.get("defaultModel") or DEFAULT_MODEL
    timeout_seconds = _int_config(config.get("timeoutSeconds"), DEFAULT_TIMEOUT_SECONDS)
    base_path = _resolve_base_path(config)
    log_root = _resolve_log_root(config, base_path)
    log_dir = _new_log_dir(log_root, task)
    inspect_cmd = _inspect_command(config)
    if not inspect_cmd:
        return {
            "error": (
                "Inspect CLI command is empty. Set providers[0].config.inspectCommand "
                "or PROMPTFOO_AGENT_THREAT_BENCH_INSPECT_COMMAND."
            )
        }

    inspect_task = f"inspect_evals/agent_threat_bench_{task}"
    eval_cmd = [
        *inspect_cmd,
        "eval",
        inspect_task,
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
                f"Inspect AgentThreatBench run timed out after {timeout_seconds}s. "
                "Increase providers[0].config.timeoutSeconds for real runs."
            ),
            "metadata": {
                "inspect_log_path": str(log_dir),
                "status": "error",
                "duration_seconds": round(time.monotonic() - started, 3),
                "task": task,
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
                "task": task,
            },
        }

    eval_log = _find_eval_log(log_dir)
    if eval_log is None:
        return {
            "error": f"Inspect completed but no .eval log was found in {log_dir}.",
            "metadata": {"inspect_log_path": str(log_dir), "status": "error", "task": task},
        }

    dump_result = _dump_eval_log(inspect_cmd, eval_log, base_path)
    if isinstance(dump_result, dict):
        return dump_result

    try:
        log_json = json.loads(dump_result.stdout)
    except json.JSONDecodeError as exc:
        return {
            "error": f"Could not parse Inspect log dump JSON for {eval_log}: {exc}",
            "metadata": {"inspect_log_path": str(eval_log), "status": "error", "task": task},
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
            },
        }

    scores = parsed.get("scores") or {}
    utility_score = scores.get("utility")
    security_score = scores.get("security")
    status = (
        "pass"
        if all(
            isinstance(score, (int, float)) and score >= 1.0
            for score in (utility_score, security_score)
        )
        else "fail"
    )
    metadata = {
        "inspect_log_path": str(eval_log),
        "status": status,
        "sample_id": sample_id,
        "requested_sample_id": str(requested_sample_id),
        "task": task,
        "inspect_task": inspect_task,
        "model": str(model),
        "utility_score": utility_score,
        "security_score": security_score,
        "num_messages": parsed.get("num_messages", 0),
        "duration_seconds": round(duration, 3),
    }
    token_usage = parsed.get("token_usage")

    inspect_error = _inspect_log_error(parsed)
    if inspect_error:
        metadata["status"] = "error"
        metadata["inspect_status"] = parsed.get("inspect_status")
        metadata["inspect_error"] = inspect_error
        result: dict[str, Any] = {
            "error": (
                f"Inspect AgentThreatBench run did not produce both scores for "
                f"sample {sample_id}: {inspect_error}"
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
        f"Task {task} sample {sample_id}: utility={utility_score} "
        f"security={security_score} status={status}\n\nFinal answer: {final_answer}"
    )
    result: dict[str, Any] = {"output": output, "metadata": metadata}
    if token_usage:
        result["tokenUsage"] = token_usage
    return result


def _inspect_command(config: dict) -> list[str]:
    env_command = os.environ.get("PROMPTFOO_AGENT_THREAT_BENCH_INSPECT_COMMAND")
    command = config.get("inspectCommand") or env_command or "inspect"
    if isinstance(command, list):
        return [str(part) for part in command]
    return shlex.split(str(command))


def _normalize_task(raw: Any) -> str | None:
    task = str(raw or "").strip()
    task = task.removeprefix("inspect_evals/")
    task = task.removeprefix("agent_threat_bench_")
    return task if task in TASKS else None


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


def _new_log_dir(log_root: Path, task: str) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = log_root / f"{stamp}-{task}-{os.getpid()}-{uuid.uuid4().hex[:8]}"
    path.mkdir(parents=True, exist_ok=False)
    return path


def _find_eval_log(log_dir: Path) -> Path | None:
    logs = sorted(
        log_dir.rglob("*.eval"), key=lambda path: path.stat().st_mtime, reverse=True
    )
    return logs[0] if logs else None


def _dump_eval_log(
    inspect_cmd: list[str], eval_log: Path, base_path: Path
) -> subprocess.CompletedProcess | dict:
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
            "error": f"Inspect log dump failed for {eval_log} with exit code {dump_result.returncode}.",
            "metadata": {"inspect_log_path": str(eval_log), "status": "error"},
        }
    return dump_result


def _parse_inspect_log(data: dict[str, Any]) -> dict[str, Any]:
    samples = data.get("samples") or []
    sample = samples[0] if samples else {}
    sample_scores, score_error = _sample_scores(sample) if sample else (None, None)
    return {
        "scores": None if score_error else sample_scores,
        "score_error": score_error,
        "sample_id": sample.get("id") or sample.get("uuid"),
        "final_answer": _final_answer(sample),
        "num_messages": len(sample.get("messages") or []),
        "token_usage": _token_usage(data, sample),
        "inspect_status": data.get("status"),
        "sample_error": sample.get("error"),
    }


def _sample_scores(sample: dict[str, Any]) -> tuple[dict[str, float] | None, str | None]:
    scores = sample.get("scores") or {}
    preferred_score = scores.get(SCORER)
    if preferred_score is None:
        if scores:
            return None, f"Inspect did not record {SCORER} for the selected sample."
        return None, None

    value = preferred_score.get("value") if isinstance(preferred_score, dict) else None
    if not isinstance(value, dict):
        return None, f"Inspect recorded {SCORER}, but its value was not a metric object."

    parsed_scores = {}
    for metric in ("utility", "security"):
        parsed = _score_value(value.get(metric))
        if parsed is None:
            return None, f"Inspect recorded {SCORER}, but {metric} was not numeric."
        parsed_scores[metric] = parsed
    return parsed_scores, None


def _score_value(value: Any) -> float | None:
    if isinstance(value, dict):
        return _score_value(value.get("value"))
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
    usage_sources = [sample.get("model_usage"), (data.get("stats") or {}).get("model_usage")]
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
    if sample_error:
        return "Inspect reported an unscored sample error. See the Inspect log for details."

    if parsed.get("inspect_status") == "error":
        return "Inspect log status is error and no scorer result was recorded."

    if not parsed.get("scores"):
        sample_id = parsed.get("sample_id")
        if sample_id:
            return (
                f"Inspect completed sample {sample_id}, but no {SCORER} result "
                "was recorded."
            )
        return (
            "Inspect completed, but selected zero samples or recorded no scorer result. "
            "Check vars.sample_id."
        )
    return None


def _int_config(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _missing_inspect_message(command: str) -> str:
    if shutil.which(command) is None:
        return (
            f"Could not find Inspect CLI command '{command}'. Install prerequisites with "
            "`pip install inspect-evals openai anthropic` or set "
            "providers[0].config.inspectCommand."
        )
    return f"Could not execute Inspect CLI command '{command}'."


def _humanize_inspect_failure(result: subprocess.CompletedProcess) -> str:
    tail = _tail(result.stderr) or _tail(result.stdout) or "(no output)"
    hint = ""
    lowered = tail.lower()
    if "specified dataset is empty" in lowered or "no samples" in lowered:
        hint = " Check vars.sample_id and vars.task."
    elif "requires optional dependencies" in lowered:
        hint = " Install the selected Inspect model provider SDK, such as `openai` or `anthropic`."
    elif "api_key" in lowered or "api key" in lowered or "authentication" in lowered:
        hint = " Check that the selected model provider API key is exported."
    elif "model" in lowered:
        hint = " Check providers[0].config.defaultModel or vars.model."
    return f"Inspect eval failed with exit code {result.returncode}.{hint}"


def _tail(text: Any, limit: int = 4000) -> str:
    if not text:
        return ""
    text = text.decode(errors="replace") if isinstance(text, bytes) else str(text)
    return text[-limit:]
