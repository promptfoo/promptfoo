---
sidebar_position: 4
sidebar_label: Overview
---

# Test Configuration Guide

promptfoo provides multiple ways to configure and organize your test cases, from simple direct configuration to external data sources. This guide will help you choose and implement the best testing approach for your needs.

## Overview

Test cases in promptfoo can be configured through:

- Direct configuration in your YAML file
- External files (CSV, JSON, YAML, etc.)
- Spreadsheets (Google Sheets)
- Public datasets (HuggingFace)
- Programmatic generation (JavaScript/TypeScript)

## Quick Reference

| Method      | Best For                | Setup Required                | Version Control |
| ----------- | ----------------------- | ----------------------------- | --------------- |
| Direct YAML | Quick tests, prototypes | None                          | ✅              |
| CSV/Sheets  | Team collaboration      | Google auth for sheets        | ⚠️              |
| HuggingFace | Benchmarking            | HF token for private datasets | ✅              |
| Local Files | Development, CI/CD      | None                          | ✅              |

## Basic Configuration

### Direct Test Cases

The simplest way to get started is defining tests directly in your configuration file:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json

tests:
  # Basic test case
  - vars:
      input: 'What is the capital of France?'
      expected: 'Paris'
    assert:
      - type: equals
        value: 'Paris'

  # Test with multiple assertions
  - vars:
      input: 'List three colors'
    assert:
      - type: contains-any
        value: ['red', 'blue', 'green']
      - type: length
        value: 3

  # Test with metadata
  - description: 'Test basic arithmetic'
    vars:
      input: 'What is 2+2?'
      expected: '4'
    metadata:
      category: 'math'
      difficulty: 'easy'
```

### Separating Tests into Files

As your test suite grows, you'll want to organize tests in separate files. There are several approaches:

1. **Single Test File**

```yaml title="promptfooconfig.yaml"
prompts: # ... your prompts configuration
providers: # ... your providers configuration
tests: file://tests.yaml
```

2. **Multiple Test Files**

```yaml title="promptfooconfig.yaml"
tests:
  - file://regression/*.yaml # Glob patterns for test categories
  - file://accuracy/basic.yaml
  - file://edge-cases.yaml
```

## Test File Formats

### YAML (Recommended)

Best for readability and maintainability:

```yaml title="tests.yaml"
- vars:
    input: 'What is the capital of France?'
    expected: 'Paris'
  assert:
    - type: equals
      value: 'Paris'
```

### JSON/JSONL

Good for programmatic generation and processing:

```json title="tests.json"
{
  "tests": [
    {
      "vars": {
        "input": "What is the capital of France?",
        "expected": "Paris"
      },
      "assert": [
        {
          "type": "equals",
          "value": "Paris"
        }
      ]
    }
  ]
}
```

For large datasets, use JSONL (one test per line):

```jsonl title="tests.jsonl"
{"vars": {"input": "What is 2+2?", "expected": "4"}, "assert": [{"type": "equals", "value": "4"}]}
{"vars": {"input": "List colors", "expected": "red blue green"}, "assert": [{"type": "contains-any", "value": ["red", "blue", "green"]}]}
```

### TypeScript/JavaScript

Best for dynamic test generation and complex logic:

```typescript title="tests.ts"
import { TestCase } from 'promptfoo';

export const tests: TestCase[] = [
  {
    vars: {
      input: 'What is the capital of France?',
      expected: 'Paris',
    },
    assert: [
      {
        type: 'equals',
        value: 'Paris',
      },
    ],
  },
];
```

## External Data Sources

### CSV and Spreadsheets

Perfect for team collaboration and non-technical users. CSV files support special columns for enhanced functionality:

```csv title="tests.csv"
input,expected,__description,__prefix,__suffix,__metric,__threshold
"What is 2+2?","4","Basic arithmetic","","","similarity",0.9
"List colors","red blue green","Color listing test","Context: ","","contains-any",1.0
```

Special columns:

- `__expected`: Test assertions (use `__expected1`, `__expected2`, etc. for multiple)
- `__prefix`: String prepended to each prompt
- `__suffix`: String appended to each prompt
- `__description`: Test description
- `__metric`: Assertion metric
- `__threshold`: Assertion threshold

[Learn more about CSV configuration →](/docs/configuration/tests/csv)

### HuggingFace Datasets

Access established benchmarks and standardized testing datasets:

```yaml title="promptfooconfig.yaml"
tests: huggingface://datasets/cais/mmlu?split=test&subset=mathematics
```

[Learn more about HuggingFace integration →](/docs/configuration/tests/huggingface)

## Advanced Configuration

### Combining Multiple Sources

Create comprehensive test suites by combining different sources:

```yaml title="promptfooconfig.yaml"
tests:
  # Regression tests from CSV
  - file://regression/*.csv

  # Benchmark tests
  - huggingface://datasets/cais/mmlu?split=test&limit=100

  # Custom test suites
  - file://tests/accuracy/*.yaml
  - file://tests/edge-cases.ts

  # Direct test cases
  - vars:
      input: 'Test prompt'
      expected: 'Expected output'
```

### Test Organization

Structure your tests using:

1. **Directory Structure**

   ```
   tests/
   ├── regression/    # Regression tests
   ├── accuracy/      # Accuracy tests
   ├── edge-cases/    # Edge cases
   └── benchmarks/    # Benchmark tests
   ```

2. **Metadata and Tagging**
   ```yaml
   - description: 'Basic arithmetic test'
     vars: { ... }
     metadata:
       category: 'math'
       priority: 'high'
       suite: 'regression'
   ```

### Output Configuration

Configure test results output:

```yaml title="promptfooconfig.yaml"
outputPath: ./results/test-results.json # Default output file
```

Command-line output options:

```bash
promptfoo eval --output results.json     # JSON format
promptfoo eval --output results.yaml     # YAML format
promptfoo eval --output results.csv      # CSV format
promptfoo eval --output results.html     # HTML format
```

## Best Practices

1. **Version Control**
   - Keep test files in version control
   - Use meaningful file names
   - Document test purposes

2. **Test Organization**
   - Start with small test sets
   - Group related tests
   - Use clear descriptions
   - Include edge cases

3. **Performance**
   - Enable caching
   - Split large test suites
   - Use appropriate formats

4. **Collaboration**
   - Document test cases
   - Use CSV for non-technical users
   - Maintain consistent formatting

## Troubleshooting

Common issues and solutions:

1. **File Loading Issues**
   - Check relative paths
   - Verify file permissions
   - Validate syntax

2. **Test Execution Problems**
   - Enable debug logging
   - Check variable substitution
   - Verify assertions

## Related Resources

- [Configuration Guide](/docs/configuration/guide)
- [CSV Configuration](/docs/configuration/tests/csv)
- [HuggingFace Integration](/docs/configuration/tests/huggingface)
- [Google Sheets Integration](/docs/configuration/tests/google-sheets)
- [Configuration Reference](/docs/configuration/reference)
