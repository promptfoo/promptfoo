"""Focused tests for provider helper behavior."""

import sys
import unittest
from pathlib import Path

EXAMPLE_DIR = Path(__file__).resolve().parent
if str(EXAMPLE_DIR) not in sys.path:
    sys.path.insert(0, str(EXAMPLE_DIR))

import provider


class BuildStepsTests(unittest.TestCase):
    def test_uses_prompt_when_no_steps_json(self):
        self.assertEqual(provider._build_steps("hello", {}), ["hello"])

    def test_parses_a_json_array_of_strings(self):
        self.assertEqual(
            provider._build_steps("ignored", {"steps_json": '["a", "b"]'}),
            ["a", "b"],
        )

    def test_rejects_non_array_json(self):
        with self.assertRaisesRegex(ValueError, "JSON array of strings"):
            provider._build_steps("unused", {"steps_json": '{"bad": true}'})

    def test_rejects_malformed_json_with_clear_error(self):
        with self.assertRaisesRegex(ValueError, "JSON array of strings"):
            provider._build_steps("unused", {"steps_json": "not json"})


class SessionIdTests(unittest.TestCase):
    def test_explicit_session_id_wins(self):
        session_id = provider._session_id({}, {"session_id": "fixed"})
        self.assertEqual(session_id, "fixed")

    def test_uses_repeat_index_when_present(self):
        session_id = provider._session_id(
            {"evaluationId": "eval-1", "testCaseId": "case-1", "repeatIndex": 2},
            {},
        )
        self.assertEqual(session_id, "promptfoo-adk-eval-1-case-1-repeat-2")

    def test_falls_back_to_defaults(self):
        session_id = provider._session_id({}, {})
        self.assertEqual(session_id, "promptfoo-adk-local-eval-default-test")


class TracerProviderTests(unittest.TestCase):
    def setUp(self):
        # Module-level state is process-wide; reset it so tests can re-install.
        provider._configured_tracer_provider = None
        provider._configured_otlp_endpoint = None

    def test_same_endpoint_returns_cached_provider(self):
        first = provider._ensure_tracer_provider("http://localhost:4318")
        second = provider._ensure_tracer_provider("http://localhost:4318")
        self.assertIs(first, second)
        self.assertEqual(len(first._active_span_processor._span_processors), 1)

    def test_different_endpoint_keeps_existing_provider(self):
        first = provider._ensure_tracer_provider("http://localhost:4318")
        with self.assertLogs(provider._logger, level="WARNING") as captured:
            second = provider._ensure_tracer_provider("http://localhost:4319")
        self.assertIs(first, second)
        # No additional processor stacked on the original provider.
        self.assertEqual(len(first._active_span_processor._span_processors), 1)
        self.assertTrue(any("ignoring request to switch" in m for m in captured.output))


if __name__ == "__main__":
    unittest.main()
