"""
Dynamic assertion value script (#6253)

This script returns a value to be used in an assertion.
Tests that file:// references in assertion values use script output.
"""


def get_value():
    return "PythonDynamicValue"
