"""
Test fixture simulating user error: using 'get_' prefix instead of 'call_' prefix.
This mimics the issue reported in #6072 where user had get_embedding_api instead of call_embedding_api.
"""


def call_api(prompt, options, context):
    """Valid default function for initialization."""
    return {"output": "test"}


def get_embedding_api(prompt, options):
    """User mistakenly named this 'get_embedding_api' instead of 'call_embedding_api'."""
    return {"embedding": [0.1, 0.2, 0.3]}


def some_helper_function():
    """Just another function to show in the available functions list."""
    return "helper"
