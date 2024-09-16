def get_assert(output, context):
    print("Prompt:", context["prompt"])
    print("Vars", context["vars"]["topic"])

    # You can return a bool...
    # return 'bananas' in output.lower()

    # A score (where 0 = Fail)...
    # return 0.5

    # Or an entire grading result, which can be simple...
    result = {
        "pass": "bananas" in output.lower(),
        "score": 0.5,
        "reason": "Contains banana",
    }

    # Or include nested assertions...
    result = {
        "pass": True,
        "score": 0.75,
        "reason": "Looks good to me",
        "componentResults": [
            {
                "pass": "bananas" in output.lower(),
                "score": 0.5,
                "reason": "Contains banana",
                "namedScores": {
                    "Uses banana": 1.0,
                },
            },
            {
                "pass": "yellow" in output.lower(),
                "score": 0.5,
                "reason": "Contains yellow",
                "namedScores": {
                    "Yellowish": 0.66,
                },
            },
        ],
    }

    return result
