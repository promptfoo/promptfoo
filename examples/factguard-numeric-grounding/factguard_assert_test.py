"""Offline tests for factguard_assert.py. Run: python -m unittest factguard_assert_test.py"""

import json
import unittest
from pathlib import Path

from factguard_assert import get_assert

HERE = Path(__file__).resolve().parent
SOURCE_FILE = HERE / "data" / "store.json"
SOURCE = json.loads(SOURCE_FILE.read_text(encoding="utf-8"))

GROUNDED = (
    "Acme Prints closed the month with 42 orders, double last month's 21, and a 4.7 rating. "
    "Conversion was 3.8% and revenue was about $1.2M."
)
WRONG_ROW = "Holo Sticker sold 30 units at $12.50, while Die-cut Magnet sold 15 units."
NOT_IN_DATA = (
    "Acme Prints closed the month with 42 orders. Orders grew 25% week over week."
)


def context(test_vars=None, config=None):
    return {"prompt": "", "vars": test_vars or {}, "test": {}, "config": config}


class FactguardAssertTest(unittest.TestCase):
    def test_grounded_summary_passes(self):
        result = get_assert(GROUNDED, context({"source": SOURCE}))
        self.assertTrue(result["pass"], result["reason"])
        self.assertEqual(result["score"], 1.0)
        self.assertEqual(result["namedScores"], {"numeric_grounding": 1.0})

    def test_source_as_json_string(self):
        result = get_assert(GROUNDED, context({"source": json.dumps(SOURCE)}))
        self.assertTrue(result["pass"], result["reason"])

    def test_number_on_wrong_row_fails_with_the_stored_value(self):
        result = get_assert(WRONG_ROW, context({"source": SOURCE}))
        self.assertFalse(result["pass"])
        self.assertIn("15: data says products[1].units_sold=12", result["reason"])

    def test_number_not_in_data_fails(self):
        result = get_assert(NOT_IN_DATA, context({"source": SOURCE}))
        self.assertFalse(result["pass"])
        self.assertIn("25%: not in data", result["reason"])

    def test_fail_under_allows_a_partial_score(self):
        result = get_assert(
            NOT_IN_DATA,
            context(config={"source_file": str(SOURCE_FILE), "fail_under": 0.5}),
        )
        self.assertTrue(result["pass"], result["reason"])
        self.assertEqual(result["score"], 0.5)

    def test_output_without_numbers_scores_one(self):
        result = get_assert("Sales were steady.", context({"source": SOURCE}))
        self.assertTrue(result["pass"])
        self.assertEqual(result["score"], 1.0)

    def test_missing_source_is_a_failed_result_not_an_exception(self):
        result = get_assert(GROUNDED, context())
        self.assertFalse(result["pass"])
        self.assertIn("no usable source data", result["reason"])

    def test_invalid_json_source_is_a_failed_result(self):
        result = get_assert(GROUNDED, context({"source": "{not json"}))
        self.assertFalse(result["pass"])


if __name__ == "__main__":
    unittest.main()
