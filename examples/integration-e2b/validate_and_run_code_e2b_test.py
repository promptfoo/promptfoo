"""Offline regressions for the E2B SDK boundary (no sandbox/API requests)."""

import unittest
from unittest.mock import create_autospec, patch

import validate_and_run_code_e2b as validator
from e2b_code_interpreter import Sandbox
from e2b_code_interpreter.models import Execution, ExecutionError, Logs


class SandboxAssertionTest(unittest.TestCase):
    def setUp(self):
        self.context = {
            "vars": {
                "function_name": "double",
                "test_input": "3",
                "expected_output": "6",
            }
        }
        self.code = "```python\ndef double(value):\n    return value * 2\n```"
        self.sandbox = create_autospec(Sandbox, instance=True)
        self.sandbox.__enter__.return_value = self.sandbox
        self.sandbox.run_code.return_value = Execution(logs=Logs(stdout=["6\n"]))
        create_patch = patch.object(validator.Sandbox, "create", autospec=True)
        self.create = create_patch.start()
        self.addCleanup(create_patch.stop)
        self.create.return_value = self.sandbox
        metrics_patch = patch.object(validator, "write_metrics")
        self.metrics = metrics_patch.start()
        self.addCleanup(metrics_patch.stop)

    def test_success_uses_supported_sdk_controls(self):
        result = validator.get_assert(self.code, self.context)
        self.assertTrue(result["pass"])
        self.create.assert_called_once_with(allow_internet_access=False, timeout=60)
        self.sandbox.run_code.assert_called_once_with(
            "def double(value):\n    return value * 2\n\nprint(double(3))\n",
            language="python",
            timeout=5,
        )
        self.sandbox.__exit__.assert_called_once()
        self.metrics.assert_called_once()

    def test_unfenced_function_with_prose_is_executable(self):
        output = "Here is the requested function:\ndef double(value):\n    return value * 2\n\nThis doubles the value."
        self.assertTrue(validator.get_assert(output, self.context)["pass"])
        program = self.sandbox.run_code.call_args.args[0]
        compile(program, "<generated>", "exec")
        self.assertNotIn("Here is", program)
        self.assertNotIn("This doubles", program)

    def test_fenced_program_preserves_imports_and_blank_lines(self):
        output = "```python\nimport math\n\ndef double(value):\n    result = value * 2\n\n    return math.floor(result)\n```"
        self.assertTrue(validator.get_assert(output, self.context)["pass"])
        program = self.sandbox.run_code.call_args.args[0]
        compile(program, "<generated>", "exec")
        self.assertIn("import math", program)
        self.assertIn("return math.floor(result)", program)

    def test_prose_before_helper_preserves_both_functions(self):
        output = "Here is the requested function:\ndef _double(value):\n    return value * 2\n\ndef double(value):\n    return _double(value)"
        extracted = validator._extract_function(output, "double")
        self.assertIsNotNone(extracted)
        # This fixed, trusted fixture proves its helper survives extraction.
        namespace = {}
        exec(extracted, namespace)
        self.assertEqual(namespace["double"](3), 6)

    def test_unfenced_example_call_does_not_change_result(self):
        output = "def double(value):\n    return value * 2\n\nprint(double(2))"
        extracted = validator._extract_function(output, "double")
        self.assertEqual(extracted, "def double(value):\n    return value * 2")

    def test_sdk_error_does_not_retry_without_controls(self):
        self.sandbox.run_code.side_effect = TypeError("unsupported SDK call")
        result = validator.get_assert(self.code, self.context)
        self.assertFalse(result["pass"])
        self.assertIn("unsupported SDK call", result["reason"])
        self.sandbox.run_code.assert_called_once()
        self.sandbox.__exit__.assert_called_once()

    def test_creation_failure_is_reported(self):
        self.create.side_effect = RuntimeError("sandbox unavailable")
        result = validator.get_assert(self.code, self.context)
        self.assertFalse(result["pass"])
        self.assertIn("sandbox unavailable", result["reason"])
        self.sandbox.run_code.assert_not_called()

    def test_metrics_use_a_provider_name_without_serialized_config(self):
        for identity, expected in [
            ({"label": "local-model"}, "local-model"),
            ({"id": "echo"}, "echo"),
            ({}, "unknown"),
        ]:
            with self.subTest(identity=identity):
                self.context["provider"] = {
                    **identity,
                    "config": {"apiKey": "dummy-private-key", "basePath": "x" * 300},
                }
                self.assertTrue(validator.get_assert(self.code, self.context)["pass"])
                self.assertEqual(self.metrics.call_args.args[1], expected)

    def test_wrong_answer_fails(self):
        self.sandbox.run_code.return_value = Execution(logs=Logs(stdout=["5\n"]))
        self.assertFalse(validator.get_assert(self.code, self.context)["pass"])

    def test_expected_and_unexpected_runtime_errors(self):
        self.sandbox.run_code.return_value = Execution(
            error=ExecutionError("ValueError", "negative input", "traceback")
        )
        self.assertFalse(validator.get_assert(self.code, self.context)["pass"])
        self.context["vars"]["expected_error"] = "ValueError"
        self.assertTrue(validator.get_assert(self.code, self.context)["pass"])
        self.context["vars"]["expected_error"] = "TypeError"
        self.assertFalse(validator.get_assert(self.code, self.context)["pass"])

    def test_missing_expected_error_fails(self):
        self.context["vars"]["expected_error"] = "ValueError"
        self.assertFalse(validator.get_assert(self.code, self.context)["pass"])

    def test_rejected_code_never_creates_sandbox(self):
        for output in [
            "no code",
            "def double(x):\n    return open('/etc/passwd').read()",
        ]:
            with self.subTest(output=output):
                self.assertFalse(validator.get_assert(output, self.context)["pass"])
        self.create.assert_not_called()


if __name__ == "__main__":
    unittest.main()
