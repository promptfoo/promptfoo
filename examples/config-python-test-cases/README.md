# config-python-test-cases (Python Test Cases with Configuration)

You can run this example with:

```bash
npx promptfoo@latest init --example config-python-test-cases
cd config-python-test-cases
```

This example demonstrates how to use Python functions to generate test cases with configurable parameters using the new TestGeneratorConfig feature.

## Overview

Previously, test generators could only be called without parameters:

```yaml
tests:
  - file://test_cases.py:generate_simple_tests
```

Now you can pass configuration objects to customize the test generation:

```yaml
tests:
  - path: file://test_cases.py:generate_simple_tests
    config:
      languages: [German, Italian]
```

## Requirements

Python 3.9 or newer is sufficient; this example uses only the standard library.
For the configured OpenAI provider, export `OPENAI_API_KEY`.

The CSV-style generator accepts a `data` dictionary containing equal-length
`source_text`, `target_language`, and `expected_translation` lists. `max_rows` is
an integer: zero selects no rows and a negative value omits rows from the end.

## Usage

Run the evaluation with:

```bash
promptfoo eval
```

## Features Demonstrated

### 1. Backward Compatibility

The old format still works:

```yaml
- file://test_cases.py:generate_simple_tests
```

### 2. Simple Configuration

Pass configuration to customize test generation:

```yaml
- path: file://test_cases.py:generate_simple_tests
  config:
    languages: [German, Italian]
```

### 3. Row Limiting

Control how many test cases are generated:

```yaml
- path: file://test_cases.py:generate_from_csv
  config:
    max_rows: 2
```

## Implementation

The Python functions accept an optional `config` parameter:

```python
from typing import Optional, Dict, Any

def generate_simple_tests(config: Optional[Dict[str, Any]] = None):
    languages = ["Spanish", "French"]  # defaults

    if config:
        languages = config.get("languages", languages)

    # Generate test cases using the configuration...
```

This enables:

- **Backward compatibility**: Existing generators work unchanged
- **Flexible configuration**: Pass any parameters as JSON
- **Reusable functions**: Same function, different configurations

## Local checks

```bash
python -m unittest discover -s . -p '*_test.py'
```
