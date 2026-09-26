import unittest
from unittest.mock import MagicMock, patch

import bertscore_check


class BertscoreAssertionTest(unittest.TestCase):
    def tearDown(self):
        bertscore_check.get_scorer.cache_clear()

    def test_batches_multiple_references_and_reuses_model(self):
        scorer = MagicMock()
        scorer.score.return_value = (None, None, MagicMock(item=lambda: 0.85))
        with patch("bertscore_check.BERTScorer", return_value=scorer) as factory:
            self.assertEqual(
                bertscore_check.get_assert(
                    "candidate", {"vars": {"reference": ["a", "b"]}}
                ),
                0.85,
            )
            scorer.score.assert_called_once_with(["candidate"], [["a", "b"]])
            bertscore_check.get_assert("candidate", {"vars": {"reference": "a"}})
            factory.assert_called_once()

    def test_reports_model_failures_in_assertion_reason(self):
        with patch(
            "bertscore_check.BERTScorer", side_effect=RuntimeError("Model unavailable")
        ):
            result = bertscore_check.get_assert(
                "candidate", {"vars": {"reference": "a"}}
            )
        self.assertFalse(result["pass"])
        self.assertEqual(result["score"], 0)
        self.assertIn("Model unavailable", result["reason"])

    def test_rejects_missing_and_invalid_references_before_loading_model(self):
        for reference in [None, "", [], [""], [1], {"text": "a"}]:
            with (
                self.subTest(reference=reference),
                patch("bertscore_check.BERTScorer") as factory,
            ):
                result = bertscore_check.get_assert(
                    "candidate", {"vars": {"reference": reference}}
                )
                self.assertFalse(result["pass"])
                self.assertIn("nonempty reference", result["reason"])
                factory.assert_not_called()


if __name__ == "__main__":
    unittest.main()
