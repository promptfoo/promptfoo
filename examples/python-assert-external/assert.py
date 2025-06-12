def get_assert(output, context):
    """
    Custom function that grades an LLM output.
    """

    # You can return a simple boolean
    if "banana" not in output.lower():
        return False

    # Or a number
    if "yellow" not in output.lower():
        return 0.5  # Partial credit

    # Or return a dict with additional info
    simple_result = {
        "pass": True,  # Using "pass" as dictionary key works fine
        "score": 0.8,
        "reason": "Good response about bananas"
    }

    # Or include nested assertions...
    # Note: Both camelCase and snake_case field names are supported
    # This example uses snake_case (pass_, component_results, named_scores, tokens_used)
    result = {
        "pass_": True,  # 'pass_' only needed for dataclasses, but supported here too
        "score": 0.75,
        "reason": "Looks good to me",
        "named_scores": {
            "creativity": 0.8,
            "accuracy": 0.9
        },
        "tokens_used": {
            "total": 150,
            "prompt": 100,
            "completion": 50
        },
        "component_results": [
            {
                "pass_": "bananas" in output.lower(),
                "score": 0.5,
                "reason": "Contains banana",
                "named_scores": {
                    "Uses banana": 1.0,
                },
            },
            {
                "pass_": "yellow" in output.lower(),
                "score": 0.5,
                "reason": "Contains yellow",
                "named_scores": {
                    "Yellowish": 0.66,
                },
            },
        ],
    }

    return result
