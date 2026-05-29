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
import subprocess
from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as distribution_version
from pathlib import Path
from typing import Any

MODELAUDIT_VERSION = "0.2.45"
SCHEMA_DRAFT_URI = "https://json-schema.org/draft/2020-12/schema"
HAS_ERRORS_DESCRIPTION = "Whether operational errors occurred during scanning"
REPO_ROOT = Path(__file__).resolve().parents[1]
BIOME_PATH = REPO_ROOT / "node_modules" / ".bin" / "biome"


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
            "https://promptfoo.dev/schemas/modelaudit/"
            f"v{version}/modelaudit-scan-result.schema.json"
        ),
        **schema,
    }


def default_output_path(version: str) -> Path:
    """Return the checked-in schema path for a ModelAudit version."""
    return (
        REPO_ROOT
        / "site"
        / "static"
        / "schemas"
        / "modelaudit"
        / f"v{version}"
        / "modelaudit-scan-result.schema.json"
    )


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


def render_schema(result_model: Any) -> str:
    """Render the generated schema with the repository's JSON formatter."""
    if not BIOME_PATH.exists():
        raise RuntimeError(f"Biome is missing at {BIOME_PATH}. Run: npm ci")

    unformatted_schema = (
        f"{json.dumps(build_schema(result_model, MODELAUDIT_VERSION), indent=2)}\n"
    )
    result = subprocess.run(
        [
            str(BIOME_PATH),
            "format",
            "--stdin-file-path",
            "modelaudit-scan-result.schema.json",
        ],
        check=True,
        input=unformatted_schema,
        capture_output=True,
        text=True,
    )
    return result.stdout


def main() -> None:
    """Generate or check the checked-in ModelAudit schema."""
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check", action="store_true", help="Fail if the schema is stale"
    )
    parser.add_argument(
        "--output", type=Path, help="Override the generated schema path"
    )
    parser.add_argument("--example", type=Path, help="Override the example result path")
    args = parser.parse_args()

    result_model = load_result_model()
    output_path = args.output or default_output_path(MODELAUDIT_VERSION)
    example_path = args.example or default_example_path(MODELAUDIT_VERSION)

    example = json.loads(example_path.read_text(encoding="utf-8"))
    result_model.model_validate(example)

    rendered_schema = render_schema(result_model)

    if args.check:
        if not output_path.exists():
            raise RuntimeError(
                f"ModelAudit schema is missing at {output_path}. "
                'Run "npm run modelAuditSchema:generate" and commit the generated file.'
            )
        if output_path.read_text(encoding="utf-8") != rendered_schema:
            raise RuntimeError(
                f"ModelAudit schema is stale at {output_path}. "
                'Run "npm run modelAuditSchema:generate" and commit the generated file.'
            )
        print(f"ModelAudit schema is current at {output_path}")
        return

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(rendered_schema, encoding="utf-8")
    print(f"Wrote ModelAudit schema to {output_path}")


if __name__ == "__main__":
    main()
