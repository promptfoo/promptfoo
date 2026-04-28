"""Generate Promptfoo test cases from Inspect's OSWorld dataset."""

from __future__ import annotations

import inspect as python_inspect
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

CONTAINER_EXAMPLE_PATH = "/tmp/osworld/desktop_env/example.json"

LoadedSample = Dict[str, str]
TestCase = Dict[str, Any]


def generate_tests(config: Optional[Dict[str, Any]] = None) -> List[TestCase]:
    """Return one Promptfoo test case per Inspect-supported OSWorld sample."""

    config = config or {}
    include_apps = _normalized_set(config.get("include_apps"))
    include_sample_ids = _as_set(config.get("sample_ids"))
    tests = [
        _test_case(sample)
        for sample in _load_osworld_samples(config)
        if _included(sample, include_apps, include_sample_ids)
    ]

    limit = config.get("limit")
    if limit is not None:
        return tests[: int(limit)]
    return tests


def _load_osworld_samples(config: Dict[str, Any]) -> List[LoadedSample]:
    try:
        from inspect_evals.osworld import osworld, osworld_small
    except ImportError as exc:
        raise RuntimeError(
            "Could not import inspect_evals.osworld. Install prerequisites with "
            "`pip install 'inspect-evals[osworld]'` before loading OSWorld tests."
        ) from exc

    corpus = str(config.get("corpus") or "small")
    include_connected = _bool_config(config.get("include_connected"), False)
    task = (
        _call_inspect_task(osworld_small, include_connected=include_connected)
        if corpus == "small"
        else _call_inspect_task(
            osworld, corpus=corpus, include_connected=include_connected
        )
    )
    dataset = task.dataset
    return [_sample_from_inspect(dataset[index]) for index in range(len(dataset))]


def _call_inspect_task(task_factory: Any, **kwargs: Any) -> Any:
    parameters = python_inspect.signature(task_factory).parameters
    supported_kwargs = {
        key: value for key, value in kwargs.items() if key in parameters
    }
    return task_factory(**supported_kwargs)


def _sample_from_inspect(sample: Any) -> LoadedSample:
    sample_id = str(getattr(sample, "id", ""))
    instruction = _sample_input_text(getattr(sample, "input", ""))
    app = _app_from_example_path(_example_path_from_sample(sample))
    return {
        "app": app,
        "sample_id": sample_id,
        "instruction": instruction,
        "task": _task_label(instruction),
    }


def _example_path_from_sample(sample: Any) -> str:
    files = getattr(sample, "files", None) or {}
    if not isinstance(files, dict):
        return ""

    configured = files.get(CONTAINER_EXAMPLE_PATH)
    if configured:
        return str(configured)

    for value in files.values():
        candidate = str(value)
        if "/examples/" in candidate.replace("\\", "/") and candidate.endswith(".json"):
            return candidate
    return ""


def _app_from_example_path(example_path: str) -> str:
    if not example_path:
        return "osworld"

    normalized_path = example_path.replace("\\", "/")
    parts = normalized_path.split("/")
    if "examples" in parts:
        index = parts.index("examples")
        if index + 1 < len(parts):
            return _normalize_app(parts[index + 1])
    return _normalize_app(Path(normalized_path).parent.name)


def _sample_input_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return " ".join(_message_content(message) for message in value).strip()
    return str(value)


def _message_content(message: Any) -> str:
    if isinstance(message, dict):
        return str(message.get("content") or "")
    return str(getattr(message, "content", "") or "")


def _task_label(instruction: str, max_length: int = 80) -> str:
    label = " ".join(instruction.split())
    if len(label) <= max_length:
        return label
    return f"{label[: max_length - 3].rstrip()}..."


def _included(
    sample: LoadedSample,
    include_apps: Set[str],
    include_sample_ids: Set[str],
) -> bool:
    if include_apps and sample["app"] not in include_apps:
        return False
    if include_sample_ids and sample["sample_id"] not in include_sample_ids:
        return False
    return True


def _test_case(sample: LoadedSample) -> TestCase:
    app = sample["app"]
    sample_id = sample["sample_id"]
    short_id = sample_id.split("-", 1)[0]
    test_case_id = f"osworld-{app.replace('_', '-')}-{short_id}"
    return {
        "description": f"{app} - {sample['task']}",
        "vars": {
            "prompt": sample["instruction"],
            "app": app,
            "sample_id": sample_id,
        },
        "metadata": {
            "app": app,
            "sample_id": sample_id,
            "testCaseId": test_case_id,
        },
    }


def _normalized_set(value: Any) -> Set[str]:
    return {_normalize_app(part) for part in _as_set(value)}


def _normalize_app(app: str) -> str:
    normalized = app.strip().lower().replace("-", "_").replace(" ", "_")
    return "vscode" if normalized == "vs_code" else normalized


def _as_set(value: Any) -> Set[str]:
    if not value:
        return set()
    if isinstance(value, str):
        return {part.strip() for part in value.split(",") if part.strip()}
    return {str(part) for part in value}


def _bool_config(value: Any, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)
