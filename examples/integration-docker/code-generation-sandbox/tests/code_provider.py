"""Deterministic generated-code fixture; the real sandbox still executes the code."""

FUNCTIONS = {
    "factorial": "def factorial(n):\n    return 1 if n <= 1 else n * factorial(n - 1)",
    "is_palindrome": "def is_palindrome(text):\n    return text == text[::-1]",
    "find_largest": "def find_largest(values):\n    return max(values)",
}


def call_api(prompt, options, context):
    name = context["vars"]["function_name"]
    code = FUNCTIONS[name]
    if context["vars"].get("sandbox_fixture_wrong") == "true":
        code = f"def {name}(value):\n    return 0"
    return {"output": f"```python\n{code}\n```"}
