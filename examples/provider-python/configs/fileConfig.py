"""
Simple parameters configuration - this is here to demonstrate how to load parameters configuration from a Python file
"""


def get_params():
    """
    Returns basic parameters for the API calls

    Returns:
        dict: A dictionary containing parameters
    """
    return {
        "max_tokens": 1000,
        "frequency_penalty": 0,
        "presence_penalty": 0,
        "timeout": 30,
        "foo": "bar",
    }
