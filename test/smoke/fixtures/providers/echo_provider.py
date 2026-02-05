"""
Simple echo provider for smoke testing Python provider functionality.
Returns the prompt prefixed with "Python Echo: ".
"""


def call_api(prompt, options, context):
    """Echo the prompt back with a prefix."""
    return {
        "output": f"Python Echo: {prompt}",
        "tokenUsage": {
            "total": len(prompt),
            "prompt": len(prompt),
            "completion": 0,
        },
    }


def custom_function(prompt, options, context):
    """Alternative function that can be called via :custom_function syntax."""
    return {
        "output": f"Custom Python: {prompt}",
    }
