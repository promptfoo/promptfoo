"""Select example manifests for the dependency installation workflow."""

import json
import os
import pathlib
import subprocess

import tomllib

WORKFLOW = ".github/workflows/python-example-dependencies.yml"
SCRIPTS = (
    ".github/scripts/python_example_manifests.py",
    ".github/scripts/test_python_example_manifests.py",
)


def is_dependency_manifest(path: str) -> bool:
    """Ignore tool-only pyprojects and unsupported project metadata formats."""
    manifest = pathlib.Path(path)
    if not manifest.is_file():
        return False
    if manifest.match("requirements*.txt"):
        return True
    return manifest.name == "pyproject.toml" and "project" in tomllib.loads(
        manifest.read_text()
    )


def select_manifests(base: str, head: str) -> list[str]:
    """Use PR changes, or all tracked examples when the installer changes."""
    changed = (
        subprocess.check_output(
            [
                "git",
                "diff",
                "--name-only",
                "-z",
                "--diff-filter=ACMR",
                base + "..." + head,
                "--",
                "examples/",
                WORKFLOW,
                *SCRIPTS,
            ]
        )
        .decode()
        .split("\0")
    )
    if any(path in changed for path in (WORKFLOW, *SCRIPTS)):
        changed = (
            subprocess.check_output(["git", "ls-files", "-z", "--", "examples/"])
            .decode()
            .split("\0")
        )
    return sorted(path for path in changed if path and is_dependency_manifest(path))


if __name__ == "__main__":
    manifests = select_manifests(os.environ["BASE_SHA"], os.environ["HEAD_SHA"])
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write(
            "matrix="
            + json.dumps({"include": [{"manifest": path} for path in manifests]})
            + "\n"
        )
        output.write("any=" + str(bool(manifests)).lower() + "\n")
