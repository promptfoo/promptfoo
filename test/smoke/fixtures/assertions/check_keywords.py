"""
Python assertion file (5.2.5)
Checks that output contains expected keywords
"""


def get_assert(output, context):
    """Check if output contains the expected keyword."""
    expected = context.get("test", {}).get("vars", {}).get("expected_word", "hello")

    if expected.lower() in output.lower():
        return {
            "pass": True,
            "score": 1.0,
            "reason": f"Output contains '{expected}'",
        }

    return {
        "pass": False,
        "score": 0.0,
        "reason": f"Output does not contain '{expected}'",
    }
