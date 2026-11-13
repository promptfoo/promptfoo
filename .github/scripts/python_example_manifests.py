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
    if manifest.name == "pyproject.toml":
        return manifest.is_file() and "project" in tomllib.loads(manifest.read_text())
    return manifest.match("requirements*.txt") and manifest.is_file()


def select_manifests(base: str, head: str) -> list[str]:
    """Use PR changes, or all tracked examples when the installer changes."""

    def git_paths(*args: str) -> list[str]:
        return subprocess.check_output(["git", *args]).decode().split("\0")

    selectors = (WORKFLOW, *SCRIPTS)
    changed = git_paths(
        "diff",
        "--name-only",
        "-z",
        "--diff-filter=ACMR",
        base + "..." + head,
        "--",
        "examples/",
        *selectors,
    )
    if any(path in changed for path in selectors):
        changed = git_paths("ls-files", "-z", "--", "examples/")
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
