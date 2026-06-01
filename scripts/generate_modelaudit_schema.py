#!/usr/bin/env python3
"""Generate checked-in JSON Schema artifacts for the latest ModelAudit release.

Use Python 3.10-3.13 and install the pinned release before running this script:

    npm ci
    python3 -m pip install --no-deps -r scripts/modelaudit_schema_requirements.txt
    npm run modelAuditSchema:generate
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as distribution_version
from pathlib import Path
from typing import Any

SCHEMA_FILENAME = "modelaudit-scan-result.schema.json"
EXAMPLE_FILENAME = "modelaudit-scan-result.example.json"
SCHEMA_DRAFT_URI = "https://json-schema.org/draft/2020-12/schema"
HAS_ERRORS_DESCRIPTION = "Whether operational errors occurred during scanning"
REPO_ROOT = Path(__file__).resolve().parents[1]
REQUIREMENTS_PATH = REPO_ROOT / "scripts" / "modelaudit_schema_requirements.txt"
MIN_PYTHON_VERSION = (3, 10)
MAX_PYTHON_VERSION = (3, 14)
SCHEMA_PATH = REPO_ROOT / "site" / "static" / "schemas" / "modelaudit" / SCHEMA_FILENAME
EXAMPLE_PATH = (
    REPO_ROOT / "site" / "static" / "examples" / "modelaudit" / EXAMPLE_FILENAME
)


def build_schema(result_model: Any) -> dict[str, Any]:
    """Build the public schema with stable metadata and corrected field semantics."""
    schema = result_model.model_json_schema()
    has_errors = schema.get("properties", {}).get("has_errors")
    if not isinstance(has_errors, dict):
        raise ValueError("Generated ModelAudit schema is missing properties.has_errors")
    has_errors["description"] = HAS_ERRORS_DESCRIPTION

    schema.pop("$schema", None)
    schema.pop("$id", None)
    return {
        "$schema": SCHEMA_DRAFT_URI,
        "$id": f"https://www.promptfoo.dev/schemas/modelaudit/{SCHEMA_FILENAME}",
        **schema,
    }


def expected_modelaudit_version() -> str:
    """Read the pinned ModelAudit version from the schema requirements file."""
    for line in REQUIREMENTS_PATH.read_text(encoding="utf-8").splitlines():
        requirement = line.strip()
        if not requirement or requirement.startswith("#"):
            continue
        if requirement.startswith("modelaudit=="):
            return requirement.removeprefix("modelaudit==").split()[0]
    raise RuntimeError(
        f"Missing modelaudit pin in {REQUIREMENTS_PATH.relative_to(REPO_ROOT)}"
    )


def install_hint() -> str:
    """Return the local install command for this generator's Python contract."""
    return (
        "python3 -m pip install --no-deps -r "
        f"{REQUIREMENTS_PATH.relative_to(REPO_ROOT)}"
    )


def validate_python_version() -> None:
    """Fail with a direct message before importing an unsupported ModelAudit runtime."""
    version_info = sys.version_info
    if not (MIN_PYTHON_VERSION <= version_info[:2] < MAX_PYTHON_VERSION):
        version = f"{version_info.major}.{version_info.minor}"
        raise RuntimeError(
            "ModelAudit schema generation requires Python 3.10-3.13; "
            f"found Python {version}. Use a supported Python and run: {install_hint()}"
        )


def load_result_model(expected_version: str) -> Any:
    """Load the schema source from the expected installed ModelAudit release."""
    try:
        installed_version = distribution_version("modelaudit")
    except PackageNotFoundError as exc:
        raise RuntimeError(
            f"Expected modelaudit=={expected_version}. Run: {install_hint()}"
        ) from exc
    if installed_version != expected_version:
        raise RuntimeError(
            f"Expected modelaudit=={expected_version}, found {installed_version}. "
            f"Run: {install_hint()}"
        )

    from modelaudit.models import ModelAuditResultModel

    return ModelAuditResultModel


def render_json(data: Any) -> str:
    """Render deterministic JSON before repository formatters normalize style."""
    return f"{json.dumps(data, indent=2)}\n"


def write_text_atomic(path: Path, contents: str) -> None:
    """Write a file without leaving a partially-written artifact on failure."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as tmp_file:
            tmp_file.write(contents)
        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except FileNotFoundError:
            pass
        raise


def main() -> None:
    """Generate the ModelAudit schema and example artifacts."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--example", type=Path, help="Override the example result path")
    args = parser.parse_args()

    validate_python_version()
    modelaudit_version = expected_modelaudit_version()
    result_model = load_result_model(modelaudit_version)
    example_path = args.example or EXAMPLE_PATH

    example = json.loads(example_path.read_text(encoding="utf-8"))
    result_model.model_validate(example)

    write_text_atomic(SCHEMA_PATH, render_json(build_schema(result_model)))
    write_text_atomic(EXAMPLE_PATH, render_json(example))
    print(f"Wrote {SCHEMA_PATH.relative_to(REPO_ROOT)}")
    print(f"Wrote {EXAMPLE_PATH.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
