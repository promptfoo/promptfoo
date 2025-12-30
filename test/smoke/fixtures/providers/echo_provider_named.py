"""
Python provider with named function export (3.4.2)
Used with file://provider.py:custom_echo syntax
"""


def custom_echo(prompt, options=None, context=None):
    """Custom named function for the provider."""
    return {
        "output": f"Python Custom Echo: {prompt}",
        "tokenUsage": {
            "total": len(prompt),
            "prompt": len(prompt),
            "completion": 0,
        },
    }
