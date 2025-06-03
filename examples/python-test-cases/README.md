# Python Test Cases with Configuration

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
      languages: ['German', 'Italian']
      phrases: ['Good morning', 'Thank you very much']
```

## Features Demonstrated

### 1. Backward Compatibility

The first test generator uses the simple format without configuration:

```yaml
- file://test_cases.py:generate_simple_tests
```

### 2. Custom Languages and Phrases

Configure which languages and phrases to test:

```yaml
- path: file://test_cases.py:generate_simple_tests
  config:
    languages: ['German', 'Italian']
    phrases: ['Good morning', 'Thank you very much']
    translations:
      ("Good morning", "German"): 'Guten Morgen'
      ("Good morning", "Italian"): 'Buongiorno'
```

### 3. Custom Data Sources

Provide custom test data directly in the configuration:

```yaml
- path: file://test_cases.py:generate_from_csv
  config:
    data:
      source_text: ['Please', 'Excuse me', "I'm sorry"]
      target_language: ['Spanish', 'French', 'Spanish']
      expected_translation: ['Por favor', 'Excusez-moi', 'Lo siento']
    max_cases: 3
```

### 4. Filtering and Limiting

Filter test cases by language and limit the number of cases:

```yaml
- path: file://test_cases.py:generate_from_csv
  config:
    filter_languages: ['French']
    max_cases: 2
```

### 5. Difficulty Levels

Generate different test complexity levels:

```yaml
- path: file://test_cases.py:TestGenerator.generate_systematic_tests
  config:
    difficulty: 'intermediate'
    languages: ['German']
    phrases: ['How are you?', 'I would like to order', 'Where is the bathroom?']
```

## Running the Example

```bash
promptfoo eval -c examples/python-test-cases/promptfooconfig.yaml --filter-first-n 5
```

## Implementation Details

The Python test generator functions now accept an optional `config` parameter:

```python
def generate_simple_tests(config=None):
    """Generate a simple set of test cases with optional configuration."""
    if config:
        languages = config.get("languages", ["Spanish", "French"])
        phrases = config.get("phrases", ["Hello world", "How are you?"])
        # Use config values...
    else:
        # Use defaults...
```

This approach allows for:

- **Backward compatibility**: Existing generators work without modification
- **Flexible configuration**: Pass any JSON-serializable data structure
- **File references**: Config values can reference external files using `file://`
- **Reusable generators**: Same function can generate different test sets based on configuration

## Benefits

1. **Reduced Code Duplication**: One generator function can create multiple test scenarios
2. **Dynamic Test Generation**: Configure test parameters without code changes
3. **Environment-Specific Tests**: Different configs for dev/staging/prod
4. **Data-Driven Testing**: Configure test data sources and parameters externally
