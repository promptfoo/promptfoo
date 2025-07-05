# python-assert (Python Assertions)

Example configurations for testing LLM outputs using Python assertions with promptfoo.

You can run this example with:

```bash
npx promptfoo@latest init --example python-assert
```

## Purpose

This example demonstrates how to use Python assertions for custom output validation with:

- External Python files with assertion functions
- Inline Python code directly in configuration files
- Configuration-based assertions with custom parameters
- Different assertion return formats (boolean, score, detailed results)

## Prerequisites

- Python 3.7+ installed and available in your PATH
- OpenAI API key (or other LLM provider)

## Environment Variables

- `OPENAI_API_KEY` - Your OpenAI API key (required)

## Configurations

This example includes two different approaches:

### External Python Files (`promptfooconfig-external.yaml`)

Uses external Python files for complex assertion logic:

- `promptfooconfig-external.yaml` - Configuration with external Python assertions
- `assert.py` - Basic assertion function with detailed scoring
- `assert_with_config.py` - Configuration-based assertion function

### Inline Python Code (`promptfooconfig-inline.yaml`)

Demonstrates inline Python assertions directly in the configuration:

- `promptfooconfig-inline.yaml` - Configuration with inline Python code
- Shows simple boolean checks and complex scoring logic

## Running the Examples

1. **External Python assertions example:**

   ```sh
   promptfoo eval -c promptfooconfig-external.yaml
   ```

2. **Inline Python assertions example:**

   ```sh
   promptfoo eval -c promptfooconfig-inline.yaml
   ```

3. **View results:**

   ```sh
   promptfoo view
   ```

## Python Assertion Patterns

### Basic Boolean Return

```python
def get_assert(output, context):
    return "expected_word" in output.lower()
```

### Score-Based Return

```python
def get_assert(output, context):
    if "perfect" in output.lower():
        return 1.0
    elif "good" in output.lower():
        return 0.5
    else:
        return 0.0
```

### Detailed Result Object

```python
def get_assert(output, context):
    return {
        "pass": True,
        "score": 0.8,
        "reason": "Contains expected content",
        "namedScores": {"quality": 0.9, "relevance": 0.7}
    }
```

## Expected Results

- **External example**: Shows advanced assertion patterns with detailed scoring and configuration support
- **Inline example**: Demonstrates quick assertions and simple validation logic

## Learn More

- [Python Assertions Documentation](https://www.promptfoo.dev/docs/configuration/expected-outputs/python/)
- [promptfoo Configuration Guide](https://www.promptfoo.dev/docs/configuration/guide/)
- [Assertion Types](https://www.promptfoo.dev/docs/configuration/expected-outputs/)
