"""
Generate 1000 test cases for performance testing the Ink CLI UI.

This script creates a variety of test cases with:
- Different content lengths (short, medium, long)
- Mix of pass/fail/error outcomes
- Varied metadata for filter testing
- Realistic latency simulation via assertions

Usage:
  tests: file://generate_tests.py:create_tests
"""

import random
import string


def random_text(length: int) -> str:
    """Generate random text of specified length."""
    words = [
        "the",
        "quick",
        "brown",
        "fox",
        "jumps",
        "over",
        "lazy",
        "dog",
        "lorem",
        "ipsum",
        "dolor",
        "sit",
        "amet",
        "consectetur",
        "adipiscing",
        "evaluation",
        "testing",
        "performance",
        "benchmark",
        "metrics",
        "artificial",
        "intelligence",
        "machine",
        "learning",
        "neural",
        "network",
        "transformer",
        "attention",
        "embedding",
        "token",
    ]
    result = []
    current_length = 0
    while current_length < length:
        word = random.choice(words)
        result.append(word)
        current_length += len(word) + 1
    return " ".join(result)[:length]


def create_tests(config=None):
    """
    Generate 1000 test cases with varied characteristics.

    Distribution:
    - 70% pass (contains assertion succeeds)
    - 20% fail (contains assertion fails)
    - 10% error simulation (invalid assertion)

    Content lengths:
    - 40% short (10-50 chars)
    - 40% medium (100-300 chars)
    - 20% long (500-1000 chars)

    Metadata categories:
    - category: math, science, language, coding, general
    - difficulty: easy, medium, hard
    - priority: low, medium, high, critical
    """
    config = config or {}
    num_tests = config.get("num_tests", 1000)
    seed = config.get("seed", 42)

    random.seed(seed)

    categories = ["math", "science", "language", "coding", "general"]
    difficulties = ["easy", "medium", "hard"]
    priorities = ["low", "medium", "high", "critical"]

    test_cases = []

    for i in range(num_tests):
        # Determine content length
        length_roll = random.random()
        if length_roll < 0.4:
            # Short content
            content_length = random.randint(10, 50)
        elif length_roll < 0.8:
            # Medium content
            content_length = random.randint(100, 300)
        else:
            # Long content
            content_length = random.randint(500, 1000)

        # Generate the input/expected content
        input_text = random_text(content_length)

        # Determine outcome (pass/fail/error)
        outcome_roll = random.random()

        if outcome_roll < 0.70:
            # Pass case - assertion will succeed
            # Echo provider returns input, so we assert it contains a word from input
            words = input_text.split()
            if words:
                expected_word = random.choice(words[:5])  # Pick from first 5 words
            else:
                expected_word = "the"
            assertions = [{"type": "contains", "value": expected_word}]
        elif outcome_roll < 0.90:
            # Fail case - assertion will fail
            # Assert something that won't be in the output
            assertions = [
                {
                    "type": "contains",
                    "value": f"NOTFOUND_{i}_{random.randint(10000, 99999)}",
                }
            ]
        else:
            # Error simulation - use icontains-all with value that will fail differently
            # This creates a "soft fail" rather than error, but helps test varied outcomes
            assertions = [
                {"type": "contains", "value": f"MISSING_{i}"},
                {"type": "javascript", "value": "output.length > 0"},  # This will pass
            ]

        # Add score-based assertion for some tests (creates varied scores)
        if random.random() < 0.3:
            # Add a similarity assertion that will produce fractional scores
            assertions.append(
                {
                    "type": "similar",
                    "value": input_text[:50],
                    "threshold": 0.5,
                }
            )

        test_case = {
            "description": f"Test case {i + 1:04d} - {categories[i % len(categories)]}",
            "vars": {
                "input": input_text,
                "test_id": i + 1,
            },
            "assert": assertions,
            "metadata": {
                "category": categories[i % len(categories)],
                "difficulty": difficulties[i % len(difficulties)],
                "priority": priorities[i % len(priorities)],
                "batch": (i // 100) + 1,  # Group into batches of 100
                "content_length": "short"
                if content_length < 100
                else "medium"
                if content_length < 500
                else "long",
            },
        }

        test_cases.append(test_case)

    return test_cases


if __name__ == "__main__":
    # Test the generator
    tests = create_tests({"num_tests": 5})
    import json

    print(json.dumps(tests, indent=2))
