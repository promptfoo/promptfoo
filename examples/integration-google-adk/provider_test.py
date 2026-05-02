"""Focused tests for provider helper behavior."""

from pathlib import Path
import sys
import unittest

EXAMPLE_DIR = Path(__file__).resolve().parent
if str(EXAMPLE_DIR) not in sys.path:
    sys.path.insert(0, str(EXAMPLE_DIR))

import provider


class ProviderTests(unittest.TestCase):
    def test_build_steps_uses_prompt_when_no_steps_json(self):
        self.assertEqual(provider._build_steps("hello", {}), ["hello"])

    def test_build_steps_requires_a_json_string_array(self):
        with self.assertRaisesRegex(ValueError, "JSON array of strings"):
            provider._build_steps("unused", {"steps_json": '{"bad": true}'})

    def test_session_id_uses_repeat_index_when_present(self):
        session_id = provider._session_id(
            {"evaluationId": "eval-1", "testCaseId": "case-1", "repeatIndex": 2},
            {},
        )
        self.assertEqual(session_id, "promptfoo-adk-eval-1-case-1-repeat-2")


if __name__ == "__main__":
    unittest.main()
