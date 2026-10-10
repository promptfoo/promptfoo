"""Regression tests for example selection, isolation, and the required CI check."""

import itertools
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import call as mock_call
from unittest.mock import patch

from examples import (
    EXAMPLES,
    ROOT,
    changed_paths,
    check_gate,
    minimum_constraints,
    pull_docker_image,
    run_example,
    select_examples,
    validate_registry,
)

SCRIPT = Path(__file__).with_name("examples.py")


class SelectionTests(unittest.TestCase):
    def test_full_run_preserves_every_registered_runtime(self):
        rows = select_examples(None)
        self.assertEqual(len(rows), 22)
        self.assertEqual(
            [(row["example"], row["python"]) for row in rows],
            [
                ("docker-sandbox", "3.10"),
                ("docker-sandbox", "3.14"),
                ("e2b", "3.10"),
                ("e2b", "3.14"),
                ("python-provider-upgrade", "3.10"),
                ("python-provider-minimums", "3.14"),
                ("redteam-langchain", "3.10"),
                ("redteam-langchain", "3.14"),
                ("openai-agents", "3.12"),
                ("openai-agents", "3.14"),
                ("openai-agents-minimums", "3.10"),
                ("openai-agents-otel", "3.12"),
                ("langgraph", "3.10"),
                ("langgraph", "3.14"),
                ("rag-pdf", "3.10"),
                ("rag-pdf-cli", "3.14"),
                ("f-score", "3.10"),
                ("f-score", "3.14"),
                ("google-adk", "3.12"),
                ("google-adk", "3.14"),
                ("google-adk-minimums", "3.10"),
                ("google-adk-litellm", "3.12"),
            ],
        )

    def test_e2b_changes_select_its_offline_sdk_tests(self):
        for filename in (
            "validate_and_run_code_e2b.py",
            "validate_and_run_code_e2b_test.py",
            "requirements.txt",
        ):
            with self.subTest(filename=filename):
                self.assertEqual(
                    select_examples([f"examples/integration-e2b/{filename}"]),
                    [
                        {"example": "e2b", "python": "3.10", "node": False},
                        {"example": "e2b", "python": "3.14", "node": False},
                    ],
                )
        self.assertEqual(EXAMPLES["e2b"].suites, ((".", "*_test.py"),))
        self.assertEqual(
            select_examples(["examples/integration-e2b-other/file.py"]), []
        )

    def test_example_changes_select_only_its_profiles(self):
        rows = select_examples(["examples/provider-python/provider.py"])
        self.assertEqual(
            [row["example"] for row in rows],
            ["python-provider-upgrade", "python-provider-minimums"],
        )
        self.assertTrue(all(not row["node"] for row in rows))

    def test_adk_changes_select_default_minimum_and_optional_profiles(self):
        rows = select_examples(["examples/integration-google-adk/agent.py"])
        self.assertEqual(
            [(row["example"], row["python"]) for row in rows],
            [
                ("google-adk", "3.12"),
                ("google-adk", "3.14"),
                ("google-adk-minimums", "3.10"),
                ("google-adk-litellm", "3.12"),
            ],
        )
        self.assertTrue(all(row["node"] for row in rows))

    def test_langchain_changes_select_only_its_supported_runtimes(self):
        for filename in (
            "langchain_provider.py",
            "langchain_provider_test.py",
            "requirements.txt",
        ):
            with self.subTest(filename=filename):
                rows = select_examples([f"examples/redteam-langchain/{filename}"])
                self.assertEqual(
                    rows,
                    [
                        {
                            "example": "redteam-langchain",
                            "python": version,
                            "node": False,
                        }
                        for version in ("3.10", "3.14")
                    ],
                )
        self.assertEqual(EXAMPLES["redteam-langchain"].suites, ((".", "*_test.py"),))

    def test_agents_changes_select_all_isolated_profiles(self):
        rows = select_examples(["examples/openai-agents/requirements.txt"])
        self.assertEqual(
            [(row["example"], row["python"]) for row in rows],
            [
                ("openai-agents", "3.12"),
                ("openai-agents", "3.14"),
                ("openai-agents-minimums", "3.10"),
                ("openai-agents-otel", "3.12"),
            ],
        )
        self.assertTrue(all(row["node"] for row in rows))
        for name in ("openai-agents", "openai-agents-minimums", "openai-agents-otel"):
            example = EXAMPLES[name]
            self.assertEqual(example.suites[0], ("tests", "test_sdk.py"))
            self.assertEqual(example.suites[1], (".", "*_test.py"))
            self.assertEqual(
                (ROOT / example.directory / example.suites[2][0]).resolve(),
                ROOT / ".github/scripts/tests/openai_agents",
            )

    def test_fscore_changes_select_its_python_only_dependency_suite(self):
        for filename in ("prepare_data.py", "dependencies_test.py", "requirements.txt"):
            with self.subTest(filename=filename):
                self.assertEqual(
                    select_examples([f"examples/eval-f-score/{filename}"]),
                    [
                        {"example": "f-score", "python": "3.10", "node": False},
                        {"example": "f-score", "python": "3.14", "node": False},
                    ],
                )
        self.assertEqual(EXAMPLES["f-score"].suites, ((".", "dependencies_test.py"),))
        self.assertEqual(select_examples(["examples/eval-f-score-other/file.py"]), [])

    def test_rag_changes_preserve_pdf_and_cli_runtime_coverage(self):
        for path in (
            "examples/eval-rag-full/requirements.txt",
            "examples/eval-rag-full/ingest.py",
            "examples/eval-rag-full/tests/smoke_cli.py",
        ):
            with self.subTest(path=path):
                rows = select_examples([path])
                self.assertEqual(
                    [(row["example"], row["python"], row["node"]) for row in rows],
                    [("rag-pdf", "3.10", False), ("rag-pdf-cli", "3.14", True)],
                )
        self.assertEqual(EXAMPLES["rag-pdf"].suites, (("tests", "test_*.py"),))
        self.assertEqual(
            EXAMPLES["rag-pdf-cli"].suites,
            (("tests", "test_*.py"), ("tests", "smoke_cli.py")),
        )
        self.assertEqual(select_examples(["examples/eval-rag-full-other/file.py"]), [])

    def test_langgraph_changes_select_its_python_only_suite(self):
        for filename in ("agent.py", "agent_test.py", "requirements.txt"):
            with self.subTest(filename=filename):
                self.assertEqual(
                    select_examples([f"examples/integration-langgraph/{filename}"]),
                    [
                        {"example": "langgraph", "python": "3.10", "node": False},
                        {"example": "langgraph", "python": "3.14", "node": False},
                    ],
                )
        self.assertEqual(EXAMPLES["langgraph"].suites, ((".", "agent_test.py"),))

    def test_shared_changes_run_all_profiles(self):
        for path in (
            "src/python/wrapper.py",
            "src/evaluator.ts",
            "src/tracing/store.ts",
            ".github/scripts/examples.py",
            ".github/scripts/tests/openai_agents/fixture.py",
            ".github/workflows/examples.yml",
            "package-lock.json",
            ".nvmrc",
            "tsdown.config.ts",
            "tsconfig.json",
            "scripts/postbuild.ts",
            "drizzle/0000_example.sql",
        ):
            with self.subTest(path=path):
                self.assertEqual(select_examples([path]), select_examples(None))

    def test_unrelated_paths_and_empty_diffs_select_nothing(self):
        for paths in (
            [],
            ["site/docs/index.md"],
            ["examples/provider-python-other/a.py"],
        ):
            self.assertEqual(select_examples(paths), [])

    def test_missing_registered_files_fail(self):
        validate_registry()
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "Missing requirements"):
                validate_registry(Path(directory))

    def test_missing_suites_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for example in EXAMPLES.values():
                path = root / example.directory
                path.mkdir(parents=True, exist_ok=True)
                (path / "requirements.txt").touch()
            with self.assertRaisesRegex(ValueError, "No tests registered"):
                validate_registry(root)

    def test_empty_test_discovery_is_not_a_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "test", directory, "test_*.py"],
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("No example tests discovered", result.stderr)

    def test_partial_revision_arguments_fail(self):
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "plan", "--base", "0" * 40],
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Provide both", result.stderr)

    def test_entirely_skipped_suite_is_not_a_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / "test_skipped.py").write_text(
                "import unittest\n"
                "@unittest.skip('fixture')\n"
                "class Skipped(unittest.TestCase):\n"
                "    def test_skipped(self): pass\n"
            )
            result = subprocess.run(
                [sys.executable, str(SCRIPT), "test", directory, "test_*.py"],
                capture_output=True,
                text=True,
            )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("All example tests were skipped", result.stderr)


class GitSelectionTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.name", "Example CI fixture")
        self.git("config", "user.email", "fixture@example.test")
        self.write("examples/provider-python/old test.py")
        self.write("examples/integration-docker/code-generation-sandbox/removed.py")
        self.base = self.commit()

    def git(self, *args):
        return subprocess.check_output(
            [
                "git",
                "-c",
                "core.hooksPath=/dev/null",
                "-c",
                "commit.gpgsign=false",
                *args,
            ],
            cwd=self.root,
            text=True,
        ).strip()

    def write(self, path):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("fixture\n")

    def commit(self):
        self.git("add", ".")
        self.git("commit", "-qm", "Fixture")
        return self.git("rev-parse", "HEAD")

    def test_merge_base_renames_deletions_and_unusual_filenames(self):
        old = self.root / "examples/provider-python/old test.py"
        old.rename(old.with_name("new\ntest.py"))
        removed = "examples/integration-docker/code-generation-sandbox/removed.py"
        (self.root / removed).unlink()
        head = self.commit()
        self.git("checkout", "-qb", "base-tip", self.base)
        self.write("src/base-only.ts")
        base_tip = self.commit()
        self.git("checkout", "-q", head)
        paths = changed_paths(base_tip, head, self.root)
        self.assertEqual(
            set(paths),
            {
                "examples/provider-python/old test.py",
                "examples/provider-python/new\ntest.py",
                removed,
            },
        )
        self.assertEqual(
            {row["example"] for row in select_examples(paths)},
            {"docker-sandbox", "python-provider-upgrade", "python-provider-minimums"},
        )
        self.assertEqual(changed_paths(head, head, self.root), [])

    def test_invalid_or_missing_revisions_fail_closed(self):
        with self.assertRaises(ValueError):
            changed_paths("--help", self.base, self.root)
        with self.assertRaises(subprocess.CalledProcessError):
            changed_paths("0" * 40, self.base, self.root)


class DockerPullTests(unittest.TestCase):
    def test_throttled_pull_recovers_with_bounded_backoff(self):
        command = ("docker", "pull", "registry/image@sha256:fixture")
        throttled = subprocess.CalledProcessError(
            1, command, stderr="toomanyrequests: Rate exceeded\n"
        )
        environment = {"EXAMPLE_SETTING": "retained"}
        with (
            patch(
                "examples.subprocess.run",
                side_effect=[
                    throttled,
                    throttled,
                    subprocess.CompletedProcess(command, 0, stderr=""),
                ],
            ) as run,
            patch("examples.time.sleep") as sleep,
        ):
            pull_docker_image(command[2], environment)
        self.assertEqual(sleep.call_args_list, [mock_call(10), mock_call(30)])
        self.assertEqual(run.call_count, 3)
        for invocation in run.call_args_list:
            self.assertEqual(invocation.args[0], command)
            self.assertEqual(invocation.kwargs["env"], environment)
            self.assertEqual(invocation.kwargs["cwd"], ROOT)
            self.assertTrue(invocation.kwargs["check"])

    def test_exhausted_throttling_preserves_the_failure(self):
        command = ("docker", "pull", "registry/image@sha256:fixture")
        throttled = subprocess.CalledProcessError(
            1, command, stderr="toomanyrequests: Rate exceeded\n"
        )
        with (
            patch("examples.subprocess.run", side_effect=throttled) as run,
            patch("examples.time.sleep") as sleep,
            self.assertRaises(subprocess.CalledProcessError) as raised,
        ):
            pull_docker_image(command[2], {})
        self.assertIs(raised.exception, throttled)
        self.assertEqual(run.call_count, 4)
        self.assertEqual(
            sleep.call_args_list, [mock_call(10), mock_call(30), mock_call(60)]
        )

    def test_other_pull_failures_are_not_retried(self):
        for stderr in (
            None,
            "manifest unknown",
            "unauthorized: authentication required",
        ):
            failure = subprocess.CalledProcessError(
                1, ("docker", "pull"), stderr=stderr
            )
            with (
                self.subTest(stderr=stderr),
                patch("examples.subprocess.run", side_effect=failure) as run,
                patch("examples.time.sleep") as sleep,
                self.assertRaises(subprocess.CalledProcessError) as raised,
            ):
                pull_docker_image("registry/image@sha256:fixture", {})
            self.assertIs(raised.exception, failure)
            self.assertEqual(run.call_count, 1)
            sleep.assert_not_called()


class RunnerTests(unittest.TestCase):
    def test_example_failure_is_never_retried(self):
        def fail_example(command, **_kwargs):
            if command[1:3] == (str(SCRIPT), "test"):
                raise subprocess.CalledProcessError(
                    1, command, stderr="toomanyrequests in an example assertion"
                )
            return subprocess.CompletedProcess(command, 0, stderr="")

        with (
            patch(
                "examples.sys.version_info", types.SimpleNamespace(major=3, minor=10)
            ),
            patch("examples.Path.is_file", return_value=True),
            patch("examples.venv.EnvBuilder.create"),
            patch("examples.subprocess.run", side_effect=fail_example) as run,
            patch("examples.time.sleep") as sleep,
            self.assertRaises(subprocess.CalledProcessError),
        ):
            run_example("docker-sandbox")
        commands = [invocation.args[0] for invocation in run.call_args_list]
        self.assertEqual(
            sum(command[:2] == ("docker", "pull") for command in commands), 1
        )
        self.assertEqual(
            sum(command[1:3] == (str(SCRIPT), "test") for command in commands), 1
        )
        sleep.assert_not_called()

    def test_docker_mirror_retains_the_example_tag_and_runs_both_suites(self):
        for minor in (10, 14):
            with (
                self.subTest(python=minor),
                patch(
                    "examples.sys.version_info",
                    types.SimpleNamespace(major=3, minor=minor),
                ),
                patch("examples.Path.is_file", return_value=True),
                patch("examples.venv.EnvBuilder.create"),
                patch("examples.subprocess.run") as run,
            ):
                run_example("docker-sandbox")
            commands = [call.args[0] for call in run.call_args_list]
            self.assertEqual(len(commands), 6)
            self.assertEqual(commands[2][:2], ("docker", "pull"))
            source = commands[2][2]
            self.assertRegex(
                source,
                r"^public\.ecr\.aws/docker/library/python@sha256:[a-f0-9]{64}$",
            )
            self.assertEqual(
                commands[3], ("docker", "tag", source, "python:3.9-alpine")
            )
            for command, relative in zip(commands[4:], (".", "tests")):
                self.assertEqual(command[1:3], (str(SCRIPT), "test"))
                self.assertEqual(
                    Path(command[3]),
                    ROOT / EXAMPLES["docker-sandbox"].directory / relative,
                )
                self.assertEqual(command[4], "test_*.py")
            self.assertTrue(all(call.kwargs["check"] for call in run.call_args_list))

    def test_docker_pull_or_tag_failure_stops_before_example_tests(self):
        for operation in ("pull", "tag"):

            def fail_docker(command, operation=operation, **_kwargs):
                if command[:2] == ("docker", operation):
                    raise subprocess.CalledProcessError(1, command)
                return subprocess.CompletedProcess(command, 0, stderr="")

            with (
                self.subTest(operation=operation),
                patch(
                    "examples.sys.version_info",
                    types.SimpleNamespace(major=3, minor=10),
                ),
                patch("examples.Path.is_file", return_value=True),
                patch("examples.venv.EnvBuilder.create"),
                patch("examples.subprocess.run", side_effect=fail_docker) as run,
                self.assertRaises(subprocess.CalledProcessError),
            ):
                run_example("docker-sandbox")
            commands = [call.args[0] for call in run.call_args_list]
            self.assertEqual(commands[-1][:2], ("docker", operation))
            self.assertFalse(
                any(command[1:3] == (str(SCRIPT), "test") for command in commands)
            )

    def test_adk_optional_adapter_is_isolated_and_runs_its_own_suite(self):
        with (
            patch(
                "examples.sys.version_info", types.SimpleNamespace(major=3, minor=12)
            ),
            patch("examples.Path.is_file", return_value=True),
            patch("examples.venv.EnvBuilder.create") as create,
            patch("examples.subprocess.run") as run,
        ):
            run_example("google-adk-litellm")
        calls = run.call_args_list
        self.assertIn("litellm>=1.101,<2", calls[0].args[0])
        self.assertIn("-r", calls[0].args[0])
        self.assertEqual(calls[1].args[0][1:], ("-m", "pip", "check"))
        self.assertEqual(calls[2].args[0][-1], "*_test.py")
        self.assertEqual(calls[3].args[0][-1], "test_litellm.py")
        self.assertEqual(
            Path(calls[3].args[0][-2]).resolve(),
            SCRIPT.parent / "tests/google_adk",
        )
        self.assertEqual(len(calls), 4)
        environment = create.call_args.args[0]
        for call in calls:
            self.assertTrue(str(call.args[0][0]).startswith(str(environment)))
            self.assertEqual(call.kwargs["env"]["PROMPTFOO_PYTHON"], call.args[0][0])
            self.assertTrue(call.kwargs["check"])
        self.assertEqual(EXAMPLES["google-adk"].extra_requirements, ())
        self.assertEqual(EXAMPLES["google-adk-minimums"].extra_requirements, ())
        self.assertFalse(environment.exists())

    def test_langchain_runs_its_existing_provider_suite_in_isolation(self):
        with (
            patch(
                "examples.sys.version_info", types.SimpleNamespace(major=3, minor=10)
            ),
            patch("examples.venv.EnvBuilder.create") as create,
            patch("examples.subprocess.run") as run,
        ):
            run_example("redteam-langchain")
        environment = create.call_args.args[0]
        commands = [call.args[0] for call in run.call_args_list]
        self.assertEqual(len(commands), 3)
        self.assertEqual(
            commands[0][1:],
            (
                "-m",
                "pip",
                "install",
                "--disable-pip-version-check",
                "-r",
                str(ROOT / "examples/redteam-langchain/requirements.txt"),
            ),
        )
        self.assertEqual(commands[1][1:], ("-m", "pip", "check"))
        self.assertEqual(
            commands[2][1:],
            (
                str(SCRIPT),
                "test",
                str(ROOT / "examples/redteam-langchain"),
                "*_test.py",
            ),
        )
        for call in run.call_args_list:
            self.assertTrue(str(call.args[0][0]).startswith(str(environment)))
            self.assertEqual(call.kwargs["env"]["PROMPTFOO_PYTHON"], call.args[0][0])
            self.assertEqual(call.kwargs["cwd"], ROOT)
            self.assertTrue(call.kwargs["check"])
        self.assertFalse(environment.exists())

    def test_agents_optional_requirements_do_not_leak_into_default(self):
        for name in ("openai-agents", "openai-agents-minimums", "openai-agents-otel"):
            with (
                self.subTest(name=name),
                patch(
                    "examples.sys.version_info",
                    types.SimpleNamespace(
                        major=3, minor=10 if name.endswith("minimums") else 12
                    ),
                ),
                patch("examples.venv.EnvBuilder.create"),
                patch("examples.subprocess.run") as run,
                patch("examples.Path.is_file", return_value=True),
            ):
                run_example(name)
            commands = [call.args[0] for call in run.call_args_list]
            self.assertEqual(len(commands), 5)
            self.assertEqual(commands[1][1:], ("-m", "pip", "check"))
            self.assertEqual(
                [command[-1] for command in commands[2:]],
                ["test_sdk.py", "*_test.py", "test_cli.py"],
            )
            self.assertEqual(
                any("opentelemetry-sdk" in arg for arg in commands[0]),
                name.endswith("otel"),
            )
            self.assertEqual("-c" in commands[0], name != "openai-agents")

    def test_minimums_retain_original_bounds(self):
        self.assertEqual(
            minimum_constraints("# comment\nanyio>=4.14.2,<5\nopenai>=3.19.2,<4\n"),
            "anyio==4.14.2\nopenai==3.19.2\n",
        )
        for requirements in ("", "# empty", "openai", "openai~=3.19"):
            with self.subTest(requirements=requirements), self.assertRaises(ValueError):
                minimum_constraints(requirements)

    def test_upgrade_preserves_legacy_environment_and_uses_isolated_python(self):
        version = types.SimpleNamespace(major=3, minor=10)
        with (
            patch("examples.sys.version_info", version),
            patch("examples.venv.EnvBuilder.create") as create,
            patch("examples.subprocess.run") as run,
        ):
            run_example("python-provider-upgrade")
        environment = create.call_args.args[0]
        calls = run.call_args_list
        self.assertIn("openai==2.3.0", calls[0].args[0])
        self.assertIn("-r", calls[1].args[0])
        self.assertIn("test", calls[2].args[0])
        self.assertEqual(len(calls), 3)
        for call in calls:
            self.assertTrue(str(call.args[0][0]).startswith(str(environment)))
            self.assertEqual(call.kwargs["env"]["PROMPTFOO_PYTHON"], call.args[0][0])
            self.assertEqual(call.kwargs["cwd"], ROOT)
            self.assertTrue(call.kwargs["check"])
        self.assertFalse(environment.exists())

    def test_fresh_environments_require_dependency_consistency(self):
        self.assertEqual(
            [
                name
                for name, example in EXAMPLES.items()
                if not example.check_dependencies
            ],
            ["python-provider-upgrade"],
        )
        with (
            patch(
                "examples.sys.version_info", types.SimpleNamespace(major=3, minor=14)
            ),
            patch("examples.venv.EnvBuilder.create"),
            patch("examples.subprocess.run") as run,
        ):
            run_example("python-provider-minimums")
        calls = run.call_args_list
        self.assertIn("-c", calls[0].args[0])
        self.assertEqual(calls[1].args[0][1:], ("-m", "pip", "check"))
        self.assertIn("test", calls[2].args[0])

    def test_install_failure_stops_before_tests(self):
        with (
            patch(
                "examples.sys.version_info", types.SimpleNamespace(major=3, minor=10)
            ),
            patch("examples.venv.EnvBuilder.create"),
            patch(
                "examples.subprocess.run",
                side_effect=subprocess.CalledProcessError(1, "pip"),
            ) as run,
        ):
            with self.assertRaises(subprocess.CalledProcessError):
                run_example("python-provider-upgrade")
        self.assertEqual(run.call_count, 1)


class GateTests(unittest.TestCase):
    def test_only_success_and_explicit_empty_selection_pass(self):
        results = ("success", "failure", "cancelled", "skipped", "")
        for selection, selected, tests in itertools.product(
            results, ("true", "false", ""), results
        ):
            with self.subTest(selection=selection, selected=selected, tests=tests):
                valid = selection == "success" and (
                    (selected == "true" and tests == "success")
                    or (selected == "false" and tests == "skipped")
                )
                if valid:
                    check_gate(selection, selected, tests)
                else:
                    with self.assertRaises(ValueError):
                        check_gate(selection, selected, tests)


if __name__ == "__main__":
    unittest.main()
