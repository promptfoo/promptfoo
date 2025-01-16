---
sidebar_position: 51
sidebar_label: Python
---

# Python assertions

The `python` assertion allows you to provide a custom Python function to validate the LLM output.

A variable named `output` is injected into the context. The function should return `true` if the output passes the assertion, and `false` otherwise. If the function returns a number, it will be treated as a score.

Example:

```yaml
assert:
  - type: python
    value: output[5:10] == 'Hello'
```

You may also return a number, which will be treated as a score:

```yaml
assert:
  - type: python
    value: math.log10(len(output)) * 10
```

## Multiline functions

Python assertions support multiline strings:

```yaml
assert:
  - type: python
    value: |
      # Insert your scoring logic here...
      if output == 'Expected output':
          return {
            'pass': True,
            'score': 0.5,
          }
      return {
        'pass': False,
        'score': 0,
      }
```

## Using test context

A `context` object is available in the Python function. Here is its type definition:

```py
from typing import Any, Dict, TypedDict, Union

class AssertContext(TypedDict):
    prompt: str
    vars: Dict[str, str]
    test: Dict[str, Any]  # Contains keys like "vars", "assert", "options"
```

For example, if the test case has a var `example`, access it in Python like this:

```yaml
tests:
  - description: 'Test with context'
    vars:
      example: 'Example text'
    assert:
      - type: python
        value: 'context['vars']['example'] in output'
```

## External .py

To reference an external file, use the `file://` prefix:

```yaml
assert:
  - type: python
    value: file://relative/path/to/script.py
    config:
      outputLengthLimit: 10
```

You can specify a particular function to use by appending it after a colon:

```yaml
assert:
  - type: python
    value: file://relative/path/to/script.py:custom_assert
```

If no function is specified, it defaults to `get_assert`.

This file will be called with an `output` string and an `AssertContext` object (see above).
It expects that either a `bool` (pass/fail), `float` (score), or `GradingResult` will be returned.

Here's an example `assert.py`:

```py
from typing import Dict, TypedDict, Union

# Default function name
def get_assert(output: str, context) -> Union[bool, float, Dict[str, Any]]:
    print('Prompt:', context['prompt'])
    print('Vars', context['vars']['topic'])

    # This return is an example GradingResult dict
    return {
      'pass': True,
      'score': 0.6,
      'reason': 'Looks good to me',
    }

# Custom function name
def custom_assert(output: str, context) -> Union[bool, float, Dict[str, Any]]:
    return len(output) > 10
```

This is an example of an assertion that uses data from a configuration defined in the assertion's YML file:

```py
from typing import Dict, Union

def get_assert(output: str, context) -> Union[bool, float, Dict[str, Any]]:
    return output.length() <= context.get('config', {}).get('outputLengthLimit', 0)
```

You can also return nested metrics and assertions via a `GradingResult` object:

```py
{
    'pass': True,
    'score': 0.75,
    'reason': 'Looks good to me',
    'componentResults': [{
        'pass': 'bananas' in output.lower(),
        'score': 0.5,
        'reason': 'Contains banana',
    }, {
        'pass': 'yellow' in output.lower(),
        'score': 0.5,
        'reason': 'Contains yellow',
    }]
}
```

### GradingResult types

Here's a Python type definition you can use for the [`GradingResult`](/docs/configuration/reference/#gradingresult) object:

```py
@dataclass
class GradingResult:
    pass_: bool  # 'pass' is a reserved keyword in Python
    score: float
    reason: str
    component_results: Optional[List['GradingResult']] = None
    named_scores: Optional[Dict[str, float]] = None  # Appear as metrics in the UI
```

## Overriding the Python binary

By default, promptfoo will run `python` in your shell. Make sure `python` points to the appropriate executable.

If a `python` binary is not present, you will see a "python: command not found" error.

To override the Python binary, set the `PROMPTFOO_PYTHON` environment variable. You may set it to a path (such as `/path/to/python3.11`) or just an executable in your PATH (such as `python3.11`).

## Other assertion types

For more info on assertions, see [Test assertions](/docs/configuration/expected-outputs).
