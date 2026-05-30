#!/usr/bin/env python3
"""Generate the checked-in JSON Schema for the pinned ModelAudit release.

Use Python 3.10-3.13 and install the pinned release before running this script:

    npm ci
    python3.13 -m pip install modelaudit==0.2.45
    npm run modelAuditSchema:generate
"""

from __future__ import annotations

import argparse
import json
from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as distribution_version
from pathlib import Path
from typing import Any

MODELAUDIT_VERSION = "0.2.45"
SCHEMA_DRAFT_URI = "https://json-schema.org/draft/2020-12/schema"
HAS_ERRORS_DESCRIPTION = "Whether operational errors occurred during scanning"
REPO_ROOT = Path(__file__).resolve().parents[1]


def build_schema(result_model: Any, version: str) -> dict[str, Any]:
    """Build the public schema with stable metadata and corrected field semantics."""
    schema = result_model.model_json_schema()
    has_errors = schema.get("properties", {}).get("has_errors")
    if not isinstance(has_errors, dict):
        raise ValueError("Generated ModelAudit schema is missing properties.has_errors")
    has_errors["description"] = HAS_ERRORS_DESCRIPTION

    return {
        "$schema": SCHEMA_DRAFT_URI,
        "$id": (
            "https://www.promptfoo.dev/schemas/modelaudit/"
            f"v{version}/modelaudit-scan-result.schema.json"
        ),
        **schema,
    }


def default_example_path(version: str) -> Path:
    """Return the checked-in example result path for a ModelAudit version."""
    return (
        REPO_ROOT
        / "site"
        / "static"
        / "examples"
        / "modelaudit"
        / f"v{version}"
        / "modelaudit-scan-result.example.json"
    )


def load_result_model() -> Any:
    """Load the schema source from the expected installed ModelAudit release."""
    try:
        installed_version = distribution_version("modelaudit")
    except PackageNotFoundError as exc:
        raise RuntimeError(
            f"Expected modelaudit=={MODELAUDIT_VERSION}. "
            f"Run: python3 -m pip install modelaudit=={MODELAUDIT_VERSION}"
        ) from exc
    if installed_version != MODELAUDIT_VERSION:
        raise RuntimeError(
            f"Expected modelaudit=={MODELAUDIT_VERSION}, found {installed_version}. "
            f"Run: python3 -m pip install modelaudit=={MODELAUDIT_VERSION}"
        )

    from modelaudit.models import ModelAuditResultModel

    return ModelAuditResultModel


def main() -> None:
    """Generate the ModelAudit schema on stdout."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--example", type=Path, help="Override the example result path")
    args = parser.parse_args()

    result_model = load_result_model()
    example_path = args.example or default_example_path(MODELAUDIT_VERSION)

    example = json.loads(example_path.read_text(encoding="utf-8"))
    result_model.model_validate(example)

    print(json.dumps(build_schema(result_model, MODELAUDIT_VERSION), indent=2))


if __name__ == "__main__":
    main()
