"""Offline contract checks against the pinned, real Hermeneutic package."""

import unittest

from assertion import get_assert


class AssertionTest(unittest.TestCase):
    def test_default_blocks_completion_and_certainty(self):
        for text, rule in [
            ("Finished 12 tests.", "completion_with_number"),
            ("This always works.", "unhedged_certainty"),
        ]:
            with self.subTest(text=text):
                result = get_assert(text, {})
                self.assertFalse(result["pass"])
                self.assertEqual(result["score"], 0)
                self.assertIn(rule, result["reason"])

    def test_threshold_changes_policy_without_hiding_matches(self):
        result = get_assert("This always works.", {"config": {"minSeverity": "high"}})
        self.assertTrue(result["pass"])
        self.assertIn("unhedged_certainty", result["reason"])
        self.assertFalse(
            get_assert("A robust solution.", {"config": {"minSeverity": "low"}})["pass"]
        )

    def test_partial_completion_is_not_flagged(self):
        self.assertTrue(get_assert("Finished 3 files, but 5 remain.", {})["pass"])

    def test_no_match_does_not_establish_truth(self):
        result = get_assert("Paris is the capital of Germany.", {})
        self.assertTrue(result["pass"])
        self.assertIn("Facts are unchecked", result["reason"])

    def test_invalid_outputs_do_not_pass(self):
        for value in (None, {}, [], 42, "", "  "):
            with self.subTest(value=value):
                self.assertFalse(get_assert(value, {})["pass"])

    def test_invalid_policy_is_an_error(self):
        with self.assertRaisesRegex(ValueError, "minSeverity"):
            get_assert(
                "The patch passed the local tests.",
                {"config": {"minSeverity": "medium"}},
            )


if __name__ == "__main__":
    unittest.main()
