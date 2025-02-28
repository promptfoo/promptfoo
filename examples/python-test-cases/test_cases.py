import pandas as pd


def generate_simple_tests():
    """Generate a simple set of test cases."""
    return [
        {
            "vars": {"text": "Hello world", "target_language": "Spanish"},
            "assert": [{"type": "contains", "value": "Hola mundo"}],
            "description": "Basic Spanish translation",
        },
        {
            "vars": {"text": "How are you?", "target_language": "French"},
            "assert": [{"type": "contains", "value": "Comment allez-vous"}],
            "description": "Basic French translation",
        },
    ]


def generate_from_csv():
    """Generate test cases from a CSV file."""
    # Create a small DataFrame for demonstration
    # In practice, you would load this from a file: pd.read_csv('translations.csv')
    df = pd.DataFrame(
        {
            "source_text": ["Good morning", "Thank you", "Goodbye"],
            "target_language": ["French", "Spanish", "German"],
            "expected_translation": ["Bonjour", "Gracias", "Auf Wiedersehen"],
        }
    )

    test_cases = []
    for _, row in df.iterrows():
        test_case = {
            "vars": {
                "text": row["source_text"],
                "target_language": row["target_language"],
            },
            "assert": [{"type": "contains", "value": row["expected_translation"]}],
            "description": f"Translate '{row['source_text']}' to {row['target_language']}",
        }
        test_cases.append(test_case)

    return test_cases


class TestGenerator:
    @staticmethod
    def generate_systematic_tests():
        """Generate a systematic set of test cases."""
        phrases = ["Hello", "Thank you", "Please"]
        languages = ["Spanish", "French", "German"]
        expected = {
            ("Hello", "Spanish"): "Hola",
            ("Hello", "French"): "Bonjour",
            ("Hello", "German"): "Hallo",
            ("Thank you", "Spanish"): "Gracias",
            ("Thank you", "French"): "Merci",
            ("Thank you", "German"): "Danke",
            ("Please", "Spanish"): "Por favor",
            ("Please", "French"): "S'il vous plaît",
            ("Please", "German"): "Bitte",
        }

        test_cases = []
        for phrase in phrases:
            for lang in languages:
                test_case = {
                    "vars": {"text": phrase, "target_language": lang},
                    "assert": [{"type": "contains", "value": expected[(phrase, lang)]}],
                    "description": f"Translate '{phrase}' to {lang}",
                }
                test_cases.append(test_case)

        return test_cases
