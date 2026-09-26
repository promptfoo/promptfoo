"""Integration checks for the example's real Docker sandbox."""

import unittest
from unittest.mock import patch

import docker
import epicbox
import epicbox.sandboxes
from validate_and_run_code import DOCKER_IMAGE, get_assert


class SandboxTest(unittest.TestCase):
    def test_missing_code_is_rejected(self) -> None:
        self.assertEqual(
            get_assert("No Python code", {}),
            {"pass": False, "score": 0, "reason": "No function definition found"},
        )

    def test_real_docker_execution_and_limits(self) -> None:
        client = docker.from_env()
        self.addCleanup(client.close)
        client.ping()
        client.images.get(DOCKER_IMAGE)
        created_ids = []
        executions = []
        original_create = epicbox.sandboxes.create
        original_run = epicbox.run

        def create_sandbox(*args, **kwargs):
            sandbox = original_create(*args, **kwargs)
            created_ids.append(sandbox.container.id)
            return sandbox

        def run_sandbox(*args, **kwargs):
            result = original_run(*args, **kwargs)
            executions.append(result)
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
                        self.assertTrue(executions[-1]["timeout"])
                    elif name == "memory limit":
                        self.assertTrue(executions[-1]["oom_killed"])
        self.assertEqual(len(created_ids), len(cases))


if __name__ == "__main__":
    unittest.main()
