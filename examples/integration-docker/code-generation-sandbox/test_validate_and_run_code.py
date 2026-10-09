"""Integration checks for the example's real Docker sandbox."""

import os
import unittest
from unittest.mock import patch

import docker
import epicbox
import epicbox.sandboxes
from validate_and_run_code import DOCKER_IMAGE, get_assert


class SandboxTest(unittest.TestCase):
    def test_docker_endpoint_uses_explicit_host_or_epicbox_default(self) -> None:
        for endpoint in (None, "unix:///tmp/example-docker.sock"):
            with (
                self.subTest(endpoint=endpoint),
                patch.dict(
                    os.environ,
                    {"DOCKER_HOST": endpoint} if endpoint else {},
                    clear=True,
                ),
                patch.object(epicbox, "configure") as configure,
                patch.object(
                    epicbox,
                    "run",
                    return_value={"exit_code": 0, "stdout": b"10", "stderr": b""},
                ),
            ):
                result = get_assert(
                    "```python\ndef check(x):\n    return x * 2\n```",
                    {
                        "vars": {
                            "function_name": "check",
                            "test_input": "5",
                            "expected_output": 10,
                        }
                    },
                )
                self.assertTrue(result["pass"])
                self.assertEqual(configure.call_args.kwargs["docker_url"], endpoint)

    def test_missing_code_is_rejected(self) -> None:
        self.assertEqual(
            get_assert("No Python code", {}),
            {"pass": False, "score": 0, "reason": "No function definition found"},
        )

    def test_sigkill_is_rejected_when_epicbox_reports_a_timeout(self) -> None:
        # Epicbox can report this result for a memory kill when Docker's first
        # inspection has OOMKilled=False. The exit code must still fail grading.
        with (
            patch.object(epicbox, "configure"),
            patch.object(
                epicbox,
                "run",
                return_value={
                    "exit_code": 137,
                    "stdout": b"",
                    "stderr": b"",
                    "duration": 0.147625,
                    "timeout": True,
                    "oom_killed": False,
                },
            ),
        ):
            result = get_assert(
                "```python\ndef check(x):\n    return len(bytearray(256 * 1024 * 1024))\n```",
                {
                    "vars": {
                        "function_name": "check",
                        "test_input": "5",
                        "expected_output": "",
                    }
                },
            )
        self.assertFalse(result["pass"])
        self.assertEqual(result["score"], 0)
        self.assertIn("Execution error", result["reason"])

    def test_real_docker_execution_and_limits(self) -> None:
        client = docker.from_env()
        self.addCleanup(client.close)
        client.ping()
        client.images.get(DOCKER_IMAGE)
        created_ids = []
        container_limits = []
        executions = []
        execution_files = []
        original_create = epicbox.sandboxes.create
        original_run = epicbox.run

        def create_sandbox(*args, **kwargs):
            sandbox = original_create(*args, **kwargs)
            created_ids.append(sandbox.container.id)
            container_limits.append(sandbox.container.attrs["HostConfig"])
            return sandbox

        def run_sandbox(*args, **kwargs):
            result = original_run(*args, **kwargs)
            executions.append(result)
            execution_files.append(kwargs["files"])
            return result

        def clean_created_containers():
            remaining = []
            for container_id in created_ids:
                try:
                    container = client.containers.get(container_id)
                except docker.errors.NotFound:
                    continue
                remaining.append(container_id)
                container.remove(force=True)
            self.assertEqual(
                remaining, [], "Sandbox containers must be removed after execution"
            )

        self.addCleanup(clean_created_containers)
        cases = [
            ("success", "return x * 2", "10", True),
            ("wrong result", "return 0", "10", False),
            ("runtime error", 'raise ValueError("fixture failure")', "10", False),
            ("CPU limit", "while True:\n        pass", "10", False),
            (
                "memory limit",
                "return len(bytearray(256 * 1024 * 1024))",
                "268435456",
                False,
            ),
            (
                "network isolation",
                "import socket\n    return sorted(name for _, name in socket.if_nameindex())",
                "['lo']",
                True,
            ),
        ]
        with (
            patch.object(epicbox.sandboxes, "create", side_effect=create_sandbox),
            patch.object(epicbox, "run", side_effect=run_sandbox),
        ):
            for name, body, expected, passed in cases:
                with self.subTest(case=name):
                    result = get_assert(
                        f"```python\ndef check(x):\n    {body}\n```",
                        {
                            "vars": {
                                "function_name": "check",
                                "test_input": "5",
                                "expected_output": expected,
                            }
                        },
                    )
                    self.assertEqual(result["pass"], passed)
                    self.assertEqual(result["score"], int(passed))
                    if name == "runtime error":
                        self.assertIn("fixture failure", result["reason"])
                    elif name == "CPU limit":
                        self.assertTrue(executions[-1]["timeout"], executions[-1])
                    elif name == "memory limit":
                        limited = executions[-1]
                        limited_config = container_limits[-1]
                        self.assertEqual(limited_config["Memory"], 64 * 1024 * 1024)
                        self.assertEqual(limited_config["MemorySwap"], 64 * 1024 * 1024)
                        self.assertEqual(limited["exit_code"], 137, limited)
                        self.assertEqual(limited["stdout"], b"", limited)

                        # Epicbox treats SIGKILL as a timeout when Docker's
                        # OOMKilled flag is false. Verify memory enforcement
                        # independently: the exact same program must complete
                        # with more memory and the unchanged one-second CPU cap.
                        control = epicbox.run(
                            "python",
                            "python main.py",
                            files=execution_files[-1],
                            limits={"cputime": 1, "memory": 512},
                        )
                        self.assertEqual(control["exit_code"], 0, control)
                        self.assertEqual(control["stdout"].strip(), b"268435456")
                        self.assertFalse(control["timeout"], control)
                        self.assertFalse(control["oom_killed"], control)
                        self.assertEqual(
                            container_limits[-1]["Memory"], 512 * 1024 * 1024
                        )
                        self.assertEqual(
                            container_limits[-1]["MemorySwap"], 512 * 1024 * 1024
                        )
                        self.assertEqual(
                            container_limits[-1]["Ulimits"], limited_config["Ulimits"]
                        )
        self.assertEqual(len(created_ids), len(cases) + 1)


if __name__ == "__main__":
    unittest.main()
