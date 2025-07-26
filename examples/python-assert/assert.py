def get_assert(output, context):
    """
    Custom function that grades an LLM output.
    """

    # You can return a bool, number, or dict
    if "banana" not in output.lower():
        return False

    if "yellow" not in output.lower():
        return 0.5

    # Snake_case field names are automatically converted to camelCase
    return {
        "pass_": True,
        "score": 0.75,
        "reason": "Good banana content",
        "named_scores": {"banana_quality": 0.8, "color_accuracy": 0.7},
        "component_results": [
            {
                "pass_": "bananas" in output.lower(),
                "score": 0.5,
                "reason": "Contains banana",
                "named_scores": {"banana_mentions": 1.0},
            },
            {
                "pass_": "yellow" in output.lower(),
                "score": 0.5,
                "reason": "Contains yellow",
                "named_scores": {"color_mentions": 0.66},
            },
        ],
    }
