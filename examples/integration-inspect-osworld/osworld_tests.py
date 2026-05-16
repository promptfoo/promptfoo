"""Generate Promptfoo test cases from Inspect's OSWorld dataset."""

from __future__ import annotations

from pathlib import Path

CONTAINER_EXAMPLE_PATH = "/tmp/osworld/desktop_env/example.json"


def generate_tests():
    """Return one Promptfoo test case per Inspect-supported small-suite sample."""

    dataset = _osworld_small_dataset()
    return [_test_case(dataset[index]) for index in range(len(dataset))]


def generate_full_tests():
    """Return one Promptfoo test case per Inspect-supported full-suite sample."""

    dataset = _osworld_full_dataset()
    return [_test_case(dataset[index]) for index in range(len(dataset))]


def _osworld_small_dataset():
    try:
        from inspect_evals.osworld import osworld_small
    except ImportError as exc:
        raise RuntimeError(
            "Could not import inspect_evals.osworld. Install prerequisites with "
            "`pip install 'inspect-evals[osworld]'` before loading OSWorld tests."
        ) from exc

    return osworld_small().dataset


def _osworld_full_dataset():
    try:
        from inspect_evals.osworld import osworld
    except ImportError as exc:
        raise RuntimeError(
            "Could not import inspect_evals.osworld. Install prerequisites with "
            "`pip install 'inspect-evals[osworld]'` before loading OSWorld tests."
        ) from exc

    return osworld(include_connected=True).dataset


def _test_case(sample):
    sample_id = str(sample.id)
    instruction = str(sample.input)
    app = _normalize_app(_example_path(sample).parent.name)
    return {
        "description": f"{app} - {_short_label(instruction)}",
        "vars": {
            "prompt": instruction,
            "app": app,
            "sample_id": sample_id,
        },
        "metadata": {
            "app": app,
            "sample_id": sample_id,
            "testCaseId": f"osworld-{app.replace('_', '-')}-{sample_id.split('-', 1)[0]}",
        },
    }


def _example_path(sample):
    try:
        return Path(str(sample.files[CONTAINER_EXAMPLE_PATH]))
    except (AttributeError, KeyError, TypeError) as exc:
        raise RuntimeError(
            f"Inspect OSWorld sample {getattr(sample, 'id', '<unknown>')} did not "
            f"include {CONTAINER_EXAMPLE_PATH} in sample.files."
        ) from exc


def _short_label(instruction, max_length=80):
    label = " ".join(str(instruction).split())
    if len(label) <= max_length:
        return label
    return f"{label[: max_length - 3].rstrip()}..."


def _normalize_app(app):
    normalized = str(app).strip().lower().replace("-", "_").replace(" ", "_")
    return "vscode" if normalized == "vs_code" else normalized
