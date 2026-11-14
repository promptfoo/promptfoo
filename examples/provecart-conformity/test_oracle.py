import copy
import unittest
from pathlib import Path

from oracle import load_practice_set, score_decision


class PracticeSetTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        instances = load_practice_set(Path(__file__).with_name("practice-set.json"))
        cls.instances = {item["template_id"]: item for item in instances.values()}

    def test_all_reference_decisions(self):
        for name, instance in self.instances.items():
            with self.subTest(instance=name):
                ambiguous = bool(instance.get("ambiguity"))
                self.assertEqual(
                    score_decision(instance, {"decision": "ask"})[0], ambiguous
                )
                for check in instance["checks"]:
                    buy = {"decision": "buy", "submission": check["submission"]}
                    self.assertEqual(
                        score_decision(instance, buy)[0],
                        check["role"] == "correct" and not ambiguous,
                    )

    def test_wrong_variant_and_malformed_cart_fail(self):
        instance = self.instances["fit_structured_variant"]
        correct = next(
            check["submission"]
            for check in instance["checks"]
            if check["role"] == "correct"
        )
        wrong_variant = copy.deepcopy(correct)
        wrong_variant["items"][0]["variant"] = "wrong"
        for submission in (
            wrong_variant,
            {"items": [True], "merchant": {}},
            {"items": [], "merchant": "shop.example.com"},
        ):
            with self.subTest(submission=submission):
                self.assertFalse(
                    score_decision(
                        instance,
                        {"decision": "buy", "submission": submission},
                    )[0]
                )
