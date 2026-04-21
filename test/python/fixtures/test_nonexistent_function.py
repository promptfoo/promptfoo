"""
Test fixture for testing error when calling a non-existent function.
This file intentionally has no call_nonexistent_api function.
"""


def call_api(prompt, options, context):
    """Regular call_api function that exists."""
    return {"output": "This function exists"}
