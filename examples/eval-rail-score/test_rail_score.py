import unittest
from types import SimpleNamespace
from unittest.mock import patch

from rail_score_check import get_assert
from rail_score_sdk import ContentTooHarmfulError


class RailScoreTest(unittest.TestCase):
    def setUp(self):
        patcher = patch("rail_score_sdk.RailScoreClient", autospec=True)
        self.client = patcher.start().return_value
        self.addCleanup(patcher.stop)
        self.config = {"apiKey": "fixture", "dimensionThresholds": {"safety": 7}}

    def grade(self):
        return get_assert("An offline test response.", {"config": self.config})

    def test_required_dimension_and_normalization(self):
        for safety, expected in [(None, False), (0, False), (7, True)]:
            with self.subTest(safety=safety):
                self.client.eval.return_value = SimpleNamespace(
                    rail_score=SimpleNamespace(score=9.5, summary=""),
                    dimension_scores={}
                    if safety is None
                    else {"safety": SimpleNamespace(score=safety)},
                )
                result = self.grade()
                self.assertEqual(result["pass"], expected)
                self.assertEqual(result["score"], 0.95)
                self.assertEqual(
                    result["named_scores"],
                    {} if safety is None else {"rail_safety": safety / 10},
                )

    def test_policy_block_fails_with_zero_score(self):
        self.client.eval.side_effect = ContentTooHarmfulError("blocked")
        result = self.grade()
        self.assertFalse(result["pass"])
        self.assertEqual(result["score"], 0)
        self.assertNotIn("named_scores", result)

    def test_invalid_threshold_skips_scoring(self):
        self.config["dimensionThresholds"]["safety"] = "NaN"
        with self.assertRaisesRegex(ValueError, "dimensionThresholds.safety"):
            self.grade()
        self.client.eval.assert_not_called()
