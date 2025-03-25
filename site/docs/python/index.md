---
sidebar_position: 1
---

# Python in promptfoo

promptfoo provides several Python integrations that allow you to interact with the library and build powerful workflows with Python.

## Python Features

- **[Type Definitions](./types.md)**: Complete Python type definitions for configuration and assertions
- **[Python Assertions](/docs/configuration/expected-outputs/python)**: Write custom assertion functions in Python
- **[Python Test Generation](/docs/configuration/parameters#import-from-python)**: Generate test cases using Python
- **[Python Prompt Functions](/docs/configuration/parameters#prompt-functions)**: Create dynamic prompts with Python

## Getting Started

To use promptfoo with Python, you don't need to install any special packages - promptfoo will use the Python interpreter available in your environment.

```bash
# Configure the Python binary if needed
export PROMPTFOO_PYTHON=python3.11
```

Most Python functionality (assertions, test generation, prompt functions) works by referencing Python files in your promptfoo configuration:

```yaml
# Using Python assertions
assert:
  - type: python
    value: file://assertions.py:custom_assert

# Using Python test generation
tests: file://tests.py:generate_tests

# Using Python prompt functions
prompts:
  - file://prompts.py:create_prompt
```

For type hinting and validation in your Python scripts, we provide comprehensive type definitions that can be imported from `promptfoo.schemas`:

```python
from promptfoo.schemas import AssertionValueFunctionContext, GradingResult

def custom_assert(output: str, context: AssertionValueFunctionContext) -> GradingResult:
    # Your assertion logic with full type checking
    return {
        "pass_": True,
        "score": 0.9,
        "reason": "Assertion passed"
    }
```

For more information on the Python types available in promptfoo, see the [Python Types Reference](./types.md).
