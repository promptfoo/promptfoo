# python-test-cases (Python Test Cases with Configuration)

You can run this example with:

```bash
npx promptfoo@latest init --example python-test-cases
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

1. **Python Dependencies**:

   ```bash
   pip install pandas
   ```

2. **Environment Variables**:
   ```bash
   export OPENAI_API_KEY=your_api_key_here
   ```

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
