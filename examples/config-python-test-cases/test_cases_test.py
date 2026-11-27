import unittest

from test_cases import generate_from_csv, generate_simple_tests


class TestGenerators(unittest.TestCase):
    def test_default_and_configured_simple_cases(self):
        self.assertEqual(len(generate_simple_tests()), 4)
        result = generate_simple_tests({"languages": ["German"], "phrases": ["Hello"]})
        self.assertEqual(
            result[0]["vars"], {"text": "Hello", "target_language": "German"}
        )

    def test_default_rows_and_assertions(self):
        result = generate_from_csv()
        self.assertEqual(len(result), 3)
        self.assertEqual(
            result[0]["assert"], [{"type": "contains", "value": "Bonjour"}]
        )
        self.assertEqual(result[-1]["vars"]["text"], "Goodbye")

    def test_custom_data(self):
        result = generate_from_csv(
            {
                "data": {
                    "source_text": ["Hi"],
                    "target_language": ["Spanish"],
                    "expected_translation": ["Hola"],
                }
            }
        )
        self.assertEqual(result[0]["assert"][0]["value"], "Hola")

    def test_row_limits(self):
        for limit, count in [(0, 0), (2, 2), (10, 3), (-1, 2)]:
            with self.subTest(limit=limit):
                self.assertEqual(len(generate_from_csv({"max_rows": limit})), count)

    def test_invalid_data_and_limits(self):
        for config in [
            {"data": {}},
            {
                "data": {
                    "source_text": ["Hi"],
                    "target_language": [],
                    "expected_translation": ["Hola"],
                }
            },
            {
                "data": {
                    "source_text": "Hi",
                    "target_language": ["Spanish"],
                    "expected_translation": ["Hola"],
                }
            },
            {"max_rows": "2"},
        ]:
            with self.subTest(config=config), self.assertRaises(ValueError):
                generate_from_csv(config)


if __name__ == "__main__":
    unittest.main()
