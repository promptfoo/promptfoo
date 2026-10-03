import unittest
from unittest.mock import MagicMock, patch

import bertscore_check


class BertscoreAssertionTest(unittest.TestCase):
    def test_batches_single_or_multiple_references_in_one_call(self):
        for references in ["a", ["a", "b"]]:
            with self.subTest(references=references):
                scorer = MagicMock()
                scorer.score.return_value = (None, None, MagicMock(item=lambda: 0.85))
                with patch("bertscore_check.BERTScorer", return_value=scorer):
                    self.assertEqual(
                        bertscore_check.get_assert(
                            "candidate", {"vars": {"reference": references}}
                        ),
                        0.85,
                    )
                expected = [references] if isinstance(references, str) else references
                scorer.score.assert_called_once_with(["candidate"], [expected])

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
