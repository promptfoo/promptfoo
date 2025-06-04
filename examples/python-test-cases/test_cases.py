from typing import Any, Dict, Optional

import pandas as pd


def generate_simple_tests(config: Optional[Dict[str, Any]] = None):
    """Generate a simple set of test cases with optional configuration."""
    # Default values
    languages = ["Spanish", "French"]
    phrases = ["Hello", "Thank you"]

    # Override with config if provided
    if config:
        languages = config.get("languages", languages)
        phrases = config.get("phrases", phrases)

    test_cases = []
    for phrase in phrases:
        for lang in languages:
            test_case = {
                "vars": {"text": phrase, "target_language": lang},
                "assert": [
                    {"type": "regex", "value": ".+"}
                ],  # Just check for non-empty output
                "description": f"Translate '{phrase}' to {lang}",
            }
            test_cases.append(test_case)

    return test_cases


def generate_from_csv(config: Optional[Dict[str, Any]] = None):
    """Generate test cases from CSV data with optional row limit."""
    # Default test data
    data = {
        "source_text": ["Good morning", "Thank you", "Goodbye"],
        "target_language": ["French", "Spanish", "German"],
        "expected_translation": ["Bonjour", "Gracias", "Auf Wiedersehen"],
    }

    # Use custom data if provided in config
    if config and "data" in config:
        data = config["data"]

    df = pd.DataFrame(data)

    # Limit rows if specified in config
    if config and "max_rows" in config:
        df = df.head(config["max_rows"])

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
