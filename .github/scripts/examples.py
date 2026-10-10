"""Select and run credential-free example tests in isolated environments."""

import argparse
import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
import time
import unittest
import venv
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Pull the official mirror in CI while retaining the image name used by the example.
DOCKER_IMAGE_MIRRORS = {
    "python:3.9-alpine": (
        "public.ecr.aws/docker/library/python"
        "@sha256:c99b6eb43b3ac4d750db3d6e8b22268d5ea9a99deead7218ce3deda7f2ca029c"
    ),
}


@dataclass(frozen=True)
class Example:
    directory: str
    python_versions: tuple[str, ...]
    suites: tuple[tuple[str, str], ...]
    node: bool = False
    docker_images: tuple[str, ...] = ()
    minimums: bool = False
    seed: tuple[str, ...] = ()
    check_dependencies: bool = True
    extra_requirements: tuple[str, ...] = ()


# Keep small helpers beside examples and larger CLI harnesses under scripts/tests.
EXAMPLES = {
    "docker-sandbox": Example(
        "examples/integration-docker/code-generation-sandbox",
        ("3.10", "3.14"),
        ((".", "test_*.py"), ("tests", "test_*.py")),
        node=True,
        docker_images=("python:3.9-alpine",),
    ),
    "e2b": Example(
        "examples/integration-e2b",
        ("3.10", "3.14"),
        ((".", "*_test.py"),),
    ),
    "python-provider-upgrade": Example(
        "examples/provider-python",
        ("3.10",),
        ((".", "dependencies_test.py"),),
        seed=(
            "openai==2.3.0",
            "anyio==4.12.1",
            "httpcore==1.0.7",
            "h11==0.14.0",
            "idna==3.6",
            "certifi==2023.11.17",
        ),
        # Preserve the existing upgrade fixture, including orphaned httpcore 1.x.
        # OpenAI 3 uses httpcore2; the old package conflicts with upgraded h11 but
        # is no longer imported. The fresh minimums profile checks the clean graph.
        check_dependencies=False,
    ),
    "python-provider-minimums": Example(
        "examples/provider-python",
        ("3.14",),
        ((".", "dependencies_test.py"),),
        minimums=True,
    ),
    "redteam-langchain": Example(
        "examples/redteam-langchain",
        ("3.10", "3.14"),
        ((".", "*_test.py"),),
    ),
    "openai-agents": Example(
        "examples/openai-agents",
        ("3.12", "3.14"),
        (
            ("tests", "test_sdk.py"),
            (".", "*_test.py"),
            ("../../.github/scripts/tests/openai_agents", "test_cli.py"),
        ),
        node=True,
    ),
    "openai-agents-minimums": Example(
        "examples/openai-agents",
        ("3.10",),
        (
            ("tests", "test_sdk.py"),
            (".", "*_test.py"),
            ("../../.github/scripts/tests/openai_agents", "test_cli.py"),
        ),
        node=True,
        minimums=True,
        extra_requirements=("openai>=3.0,<4",),
    ),
    "openai-agents-otel": Example(
        "examples/openai-agents",
        ("3.12",),
        (
            ("tests", "test_sdk.py"),
            (".", "*_test.py"),
            ("../../.github/scripts/tests/openai_agents", "test_cli.py"),
        ),
        node=True,
        minimums=True,
        extra_requirements=(
            "opentelemetry-api>=1.44,<2",
            "opentelemetry-sdk>=1.44,<2",
            "opentelemetry-exporter-otlp-proto-http>=1.44,<2",
        ),
    ),
    "langgraph": Example(
        "examples/integration-langgraph",
        ("3.10", "3.14"),
        ((".", "agent_test.py"),),
    ),
    "rag-pdf": Example(
        "examples/eval-rag-full",
        ("3.10",),
        (("tests", "test_*.py"),),
    ),
    "rag-pdf-cli": Example(
        "examples/eval-rag-full",
        ("3.14",),
        (("tests", "test_*.py"), ("tests", "smoke_cli.py")),
        node=True,
    ),
    "f-score": Example(
        "examples/eval-f-score",
        ("3.10", "3.14"),
        ((".", "dependencies_test.py"),),
    ),
    "google-adk": Example(
        "examples/integration-google-adk",
        ("3.12", "3.14"),
        ((".", "*_test.py"), ("../../.github/scripts/tests/google_adk", "test_cli.py")),
        node=True,
    ),
    "google-adk-minimums": Example(
        "examples/integration-google-adk",
        ("3.10",),
        ((".", "*_test.py"), ("../../.github/scripts/tests/google_adk", "test_cli.py")),
        node=True,
        minimums=True,
    ),
    "google-adk-litellm": Example(
        "examples/integration-google-adk",
        ("3.12",),
        (
            (".", "*_test.py"),
            ("../../.github/scripts/tests/google_adk", "test_litellm.py"),
        ),
        node=True,
        extra_requirements=("litellm>=1.101,<2",),
    ),
}

# Shared runtime changes can break examples without changing their own directories.
SHARED_PREFIXES = (
    "src/",
    "scripts/",
    "drizzle/",
    ".github/scripts/",
    ".github/workflows/",
)
SHARED_FILES = {
    "package.json",
    "package-lock.json",
    "tsdown.config.ts",
    "tsconfig.json",
    ".nvmrc",
    ".npmrc",
}


def validate_registry(root: Path = ROOT) -> None:
    for name, example in EXAMPLES.items():
        if not re.fullmatch(r"[a-z0-9-]+", name) or not example.python_versions:
            raise ValueError(f"Invalid example registration: {name}")
        directory = root / example.directory
        if not (directory / "requirements.txt").is_file():
            raise ValueError(f"Missing requirements for {name}")
        for relative, pattern in example.suites:
            if not any((directory / relative).glob(pattern)):
                raise ValueError(
                    f"No tests registered for {name}: {relative}/{pattern}"
                )
        if not example.suites:
            raise ValueError(f"No suites registered for {name}")


def changed_paths(base: str, head: str, root: Path = ROOT) -> list[str]:
    # Use the merge-base and NUL-delimited paths, as in the manifest selector in #11173.
    # Include deletions and both sides of renames; dropping a test must not skip its job.
    for revision in (base, head):
        if not re.fullmatch(r"[0-9a-fA-F]{40}", revision):
            raise ValueError(
                "Example selection requires full base and head commit SHAs"
            )
    output = subprocess.check_output(
        [
            "git",
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--name-only",
            "--no-renames",
            "-z",
            f"{base}...{head}",
            "--",
        ],
        cwd=root,
    )
    return [path for path in output.decode().split("\0") if path]


def select_examples(paths: list[str] | None) -> list[dict]:
    all_examples = paths is None or any(
        path.startswith(SHARED_PREFIXES) or path in SHARED_FILES for path in paths
    )
    return [
        {"example": name, "python": version, "node": example.node}
        for name, example in EXAMPLES.items()
        if all_examples
        or any(path.startswith(example.directory + "/") for path in paths)
        for version in example.python_versions
    ]


def minimum_constraints(requirements: str) -> str:
    """Pin simple lower bounds while retaining the original requirements in pip."""
    constraints = []
    for line in requirements.splitlines():
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        match = re.fullmatch(r"([A-Za-z0-9_.-]+)>=([^,;\s]+)(?:,[^;]+)?", line)
        if not match:
            raise ValueError(f"Unsupported minimum requirement: {line}")
        constraints.append(f"{match[1]}=={match[2]}")
    if not constraints:
        raise ValueError("No minimum requirements found")
    return "\n".join(constraints) + "\n"


def check_gate(selection: str, selected: str, tests: str) -> None:
    expected = "success" if selected == "true" else "skipped"
    if selection != "success" or selected not in ("true", "false") or tests != expected:
        raise ValueError(
            f"Examples failed: selection={selection}, selected={selected}, tests={tests}"
        )


def pull_docker_image(image: str, env: dict[str, str]) -> None:
    """Retry registry throttling without retrying example execution."""
    command = ("docker", "pull", image)
    delays = (10, 30, 60)
    for attempt in range(len(delays) + 1):
        print(f"+ {shlex.join(command)}", flush=True)
        try:
            result = subprocess.run(
                command,
                cwd=ROOT,
                env=env,
                check=True,
                text=True,
                stderr=subprocess.PIPE,
            )
        except subprocess.CalledProcessError as error:
            if error.stderr:
                print(error.stderr, file=sys.stderr, end="", flush=True)
            if (
                attempt == len(delays)
                or "toomanyrequests" not in (error.stderr or "").lower()
            ):
                raise
            delay = delays[attempt]
            print(f"Registry throttled Docker pull; retrying in {delay}s", flush=True)
            time.sleep(delay)
        else:
            if result.stderr:
                print(result.stderr, file=sys.stderr, end="", flush=True)
            return


def run_example(name: str) -> None:
    validate_registry()
    example = EXAMPLES[name]
    version = f"{sys.version_info.major}.{sys.version_info.minor}"
    if version not in example.python_versions:
        raise ValueError(f"{name} requires Python {', '.join(example.python_versions)}")
    if example.node and not (ROOT / "dist/src/entrypoint.js").is_file():
        raise ValueError("Build the local CLI first: npx tsdown && npm run postbuild")
    with tempfile.TemporaryDirectory(prefix=f"promptfoo-{name}-") as temporary:
        environment = Path(temporary) / "venv"
        # Match `python -m venv`: copied standalone CPython binaries may lose their
        # relative shared-library location on macOS.
        venv.EnvBuilder(with_pip=True, symlinks=os.name != "nt").create(environment)
        python = environment / (
            "Scripts/python.exe" if os.name == "nt" else "bin/python"
        )
        env = dict(
            os.environ, PROMPTFOO_PYTHON=str(python), PROMPTFOO_EXAMPLE_PROFILE=name
        )

        def run(*command: str) -> None:
            print(f"+ {shlex.join(command)}", flush=True)
            subprocess.run(command, cwd=ROOT, env=env, check=True)

        pip = (str(python), "-m", "pip", "install", "--disable-pip-version-check")
        if example.seed:
            run(*pip, *example.seed)
        requirements = ROOT / example.directory / "requirements.txt"
        # Resolve optional adapters together with the example's own bounds.
        install = [*pip, "-r", str(requirements), *example.extra_requirements]
        if example.minimums:
            constraints = Path(temporary) / "minimums.txt"
            constraints.write_text(
                minimum_constraints(
                    requirements.read_text()
                    + "\n"
                    + "\n".join(example.extra_requirements)
                )
            )
            install.extend(("-c", str(constraints)))
        run(*install)
        if example.check_dependencies:
            run(str(python), "-m", "pip", "check")
        for image in example.docker_images:
            source = DOCKER_IMAGE_MIRRORS.get(image, image)
            pull_docker_image(source, env)
            if source != image:
                run("docker", "tag", source, image)
        for relative, pattern in example.suites:
            run(
                str(python),
                str(Path(__file__).resolve()),
                "test",
                str(ROOT / example.directory / relative),
                pattern,
            )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    plan = commands.add_parser("plan")
    plan.add_argument("--base")
    plan.add_argument("--head")
    commands.add_parser("gate")
    run = commands.add_parser("run")
    run.add_argument("example", choices=EXAMPLES)
    test = commands.add_parser("test")
    test.add_argument("directory")
    test.add_argument("pattern")
    args = parser.parse_args()
    if args.command == "plan":
        validate_registry()
        if bool(args.base) != bool(args.head):
            parser.error("Provide both --base and --head, or neither for a full run")
        paths = changed_paths(args.base, args.head) if args.base else None
        matrix = {"include": select_examples(paths)}
        print(json.dumps(matrix))
        if "GITHUB_OUTPUT" in os.environ:
            with open(os.environ["GITHUB_OUTPUT"], "a") as output:
                output.write(f"matrix={json.dumps(matrix)}\n")
                output.write(f"any={str(bool(matrix['include'])).lower()}\n")
    elif args.command == "gate":
        check_gate(
            os.environ["SELECTION_RESULT"],
            os.environ["ANY_SELECTED"],
            os.environ["TEST_RESULT"],
        )
    elif args.command == "run":
        run_example(args.example)
    else:
        suite = unittest.defaultTestLoader.discover(
            args.directory, pattern=args.pattern
        )
        if not suite.countTestCases():
            raise ValueError("No example tests discovered")
        result = unittest.TextTestRunner(verbosity=2).run(suite)
        if result.testsRun == len(result.skipped):
            raise ValueError("All example tests were skipped")
        sys.exit(0 if result.wasSuccessful() else 1)


if __name__ == "__main__":
    main()
