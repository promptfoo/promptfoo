---
sidebar_position: 4
---

# External Tests

promptfoo supports multiple ways to load test cases from external sources, making it easy to evaluate your LLMs at scale. Choose the approach that best fits your workflow:

## Quick Start

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json

# Direct test cases in config
tests:
  - vars:
      input: "What is the capital of France?"
      expected: "Paris"
      temperature: 0.7  # Provider options are supported
  - vars:
      input: "What is 2+2?"
      expected: "4"
      assert:  # Explicit assertions are supported
        - type: equals
          value: "4"

# Load from CSV file
tests: file://tests.csv

# Load from Google Sheets
tests: https://docs.google.com/spreadsheets/d/your-sheet-id/edit

# Load from HuggingFace dataset
tests: huggingface://datasets/cais/mmlu?split=test&subset=mathematics

# Load from YAML file
tests: file://tests.yaml

# Load from JSON file
tests: file://tests.json

# Load from JSONL file
tests: file://tests.jsonl

# Load from TypeScript file
tests: file://tests.ts

# Load from JavaScript file
tests: file://tests.js

# Load from multiple sources
tests:
  - file://regression/*.yaml  # Glob patterns supported
  - file://accuracy/*.json    # JSON files supported
  - file://edge-cases.ts      # TypeScript/JavaScript supported
```

## Available Dataset Sources

### Direct Test Cases

The simplest way to specify test cases is directly in your configuration file.

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json

prompts: file://prompt.txt
providers: openai:gpt-4o

tests:
  # Basic test case
  - vars:
      input: 'What is the capital of France?'
      expected: 'Paris'
    assert:
      - type: equals
        value: 'Paris'

  # Test case with multiple assertions
  - vars:
      input: 'List three colors'
      expected: 'red, blue, green'
    assert:
      - type: contains-any
        value: ['red', 'blue', 'green']
      - type: length
        value: 3

  # Test case with description and metadata
  - description: 'Test basic arithmetic'
    vars:
      input: 'What is 2+2?'
      expected: '4'
    assert:
      - type: contains
        value: '4'
    metadata:
      category: 'math'
      difficulty: 'easy'
```

### [CSV and Spreadsheets](/docs/configuration/tests/csv)

Perfect for:

- Collaborating with non-technical team members
- Quick iteration on test cases
- Simple data organization
- Integration with existing spreadsheet workflows

### [HuggingFace Datasets](/docs/configuration/tests/huggingface)

Ideal for:

- Evaluating against established benchmarks
- Testing across multiple languages
- Accessing large-scale evaluation datasets
- Standardized testing with popular datasets like MMLU, ARC, and GSM8K

### Local Files

Great for:

- Version-controlled test suites
- Custom test case organization
- Local development and testing
- CI/CD integration

#### YAML Files

YAML is the default format for test cases. It supports all promptfoo features and provides a clean, readable syntax:

```yaml
# tests.yaml
- vars:
    input: 'What is the capital of France?'
    expected: 'Paris'
  assert:
    - type: equals
      value: 'Paris'

- vars:
    input: 'What is 2+2?'
    expected: '4'
  assert:
    - type: contains
      value: '4'
```

#### JSON Files

JSON files offer a more strict format and are great for programmatically generated test cases:

```json
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

JS/TS files allow you to programmatically generate test cases and take advantage of type checking:

```typescript
// tests.ts
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

```javascript
// tests.js
module.exports = [
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

## Best Practices

1. **Start Small**: Begin with a manageable subset of test cases
2. **Mix and Match**: Combine different dataset sources for comprehensive testing
3. **Version Control**: Keep your test cases in version control when possible
4. **Cache Results**: Enable caching to speed up repeated evaluations
5. **Document Tests**: Use description fields to explain test case purposes
6. **Organize Tests**: Group related test cases using tags or separate files
7. **Use Types**: For TypeScript files, leverage type checking to catch errors early
8. **Modular Organization**: Split large test suites into multiple files by category

## Examples

### Combining Multiple Sources

```yaml
prompts:
  - file://prompt.txt

providers:
  - openai:gpt-4

tests:
  # Load regression tests from CSV
  - file://regression_tests.csv

  # Load benchmark tests from HuggingFace
  - huggingface://datasets/cais/mmlu?split=test&limit=100

  # Load YAML test suites
  - file://tests/accuracy/*.yaml

  # Load TypeScript test cases
  - file://tests/edge-cases.ts

  # Include manual test cases
  - vars:
      input: 'Test prompt'
      expected: 'Expected output'
```

### Using Dataset-Specific Features

```yaml
tests:
  # CSV with special columns
  - file://tests.csv # Uses expected_output, expected_contains columns

  # HuggingFace with configuration
  - huggingface://datasets/gsm8k?split=test&limit=50 # Uses question/answer fields

  # YAML with advanced assertions
  - file://tests.yaml # Uses full assertion syntax

defaultTest:
  assert:
    - type: similar
      threshold: 0.7
```

## Related Resources

- [Configuration Guide](/docs/configuration/guide)
- [CSV Dataset Guide](/docs/configuration/tests/csv)
- [HuggingFace Dataset Guide](/docs/configuration/tests/huggingface)
- [Google Sheets Integration](/docs/configuration/tests/google-sheets)
- [Configuration Reference](/docs/configuration/reference)

## Dataset Types Overview

| Type        | Best For                | Key Features                        | Setup Required                 |
| ----------- | ----------------------- | ----------------------------------- | ------------------------------ |
| Direct      | Quick tests, prototypes | Immediate feedback, simple          | None                           |
| CSV/Sheets  | Team collaboration      | Easy editing, sharing               | Google auth for private sheets |
| HuggingFace | Benchmarking            | Standard datasets, multilingual     | HF token for private datasets  |
| Local Files | Version control         | Git integration, TypeScript support | None                           |

## Integration Examples

### Combining Dataset Types

```yaml
tests:
  # Regression tests from CSV
  - file://regression_tests.csv

  # Benchmark from HuggingFace
  - huggingface://datasets/cais/mmlu?split=test&limit=100

  # Custom tests with explicit assertions
  - vars:
      input: 'Test prompt'
      expected: 'Expected output'
      assert:
        - type: similar
          threshold: 0.7
```

### Using Provider Options

```yaml
defaultTest:
  options:
    temperature: 0.7
    max_tokens: 100
  assert:
    - type: similar
      threshold: 0.8
```
