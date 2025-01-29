---
sidebar_position: 4
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

## External Data Sources

### CSV and Spreadsheets

Perfect for team collaboration and quick iterations. CSV files support special columns for enhanced functionality:

```csv title="tests.csv"
input,expected,__description
"What is 2+2?","4","Basic arithmetic"
"List colors","red blue green","Color listing test"
```

[Learn more about CSV configuration →](/docs/configuration/tests/csv)

### HuggingFace Datasets

Access established benchmarks and standardized testing datasets:

```yaml title="promptfooconfig.yaml"
tests: huggingface://datasets/cais/mmlu?split=test&subset=mathematics
```

[Learn more about HuggingFace integration →](/docs/configuration/tests/huggingface)

### Local Files

#### YAML Files

```yaml title="tests.yaml"
- vars:
    input: 'What is the capital of France?'
    expected: 'Paris'
  assert:
    - type: equals
      value: 'Paris'
```

#### JSON/JSONL Files

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

#### JavaScript/TypeScript Files

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

## Advanced Configuration

### Combining Multiple Sources

Mix different test sources for comprehensive testing:

```yaml title="promptfooconfig.yaml"
tests:
  # Regression tests from CSV
  - file://regression/*.csv

  # Benchmark tests
  - huggingface://datasets/cais/mmlu?split=test&limit=100

  # Custom test suites
  - file://tests/accuracy/*.yaml
  - file://tests/edge-cases.ts
```

### Test Organization

Structure your tests using:

1. **Directories** - Group related test files
2. **Metadata** - Tag tests with categories
3. **Descriptions** - Document test purposes
4. **File types** - Separate different kinds of tests

## Best Practices

1. **Version Control**

   - Keep test files in version control
   - Use meaningful file names and directory structure
   - Document test case purposes

2. **Test Management**

   - Start with small test sets
   - Incrementally add test cases
   - Use descriptive test names
   - Include edge cases

3. **Performance**

   - Enable caching for repeated evaluations
   - Use appropriate file formats for your use case
   - Split large test suites into multiple files

4. **Collaboration**
   - Document test case purposes
   - Use CSV/Sheets for non-technical team members
   - Maintain consistent formatting

## Troubleshooting

Common issues and solutions:

1. **File Loading Issues**

   - Verify file paths are relative to config location
   - Check file permissions
   - Validate JSON/YAML syntax

2. **Test Execution Problems**
   - Enable debug logging
   - Verify variable substitution
   - Check assertion syntax

## Related Resources

- [Configuration Guide](/docs/configuration/guide)
- [CSV Dataset Guide](/docs/configuration/tests/csv)
- [HuggingFace Integration](/docs/configuration/tests/huggingface)
- [Google Sheets Integration](/docs/configuration/tests/google-sheets)
- [Configuration Reference](/docs/configuration/reference)
