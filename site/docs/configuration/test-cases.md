---
sidebar_position: 12
sidebar_label: Test Cases
title: Test Case Configuration - Variables, Assertions, and Data
description: Configure test cases for LLM evaluation with variables, assertions, CSV data, and dynamic generation. Learn inline tests, external files, and media support.
keywords:
  [
    test cases,
    LLM testing,
    evaluation data,
    assertions,
    CSV tests,
    variables,
    dynamic testing,
    test automation,
  ]
pagination_prev: configuration/prompts
pagination_next: configuration/scenarios
---

# Test Case Configuration

Define evaluation scenarios with variables, assertions, and test data.

## Inline Tests

The simplest way to define tests is directly in your config:

```yaml title="promptfooconfig.yaml"
tests:
  - vars:
      question: 'What is the capital of France?'
    assert:
      - type: contains
        value: 'Paris'

  - vars:
      question: 'What is 2 + 2?'
    assert:
      - type: equals
        value: '4'
```

### Test Structure

Each test case can include:

```yaml
tests:
  - description: 'Optional test description'
    vars:
      # Variables to substitute in prompts
      var1: value1
      var2: value2
    assert:
      # Expected outputs and validations
      - type: contains
        value: 'expected text'
    metadata:
      # Filterable metadata
      category: math
      difficulty: easy
```

## External Test Files

For larger test suites, store tests in separate files:

```yaml title="promptfooconfig.yaml"
tests: file://tests.yaml
```

Or load multiple files:

```yaml
tests:
  - file://basic_tests.yaml
  - file://advanced_tests.yaml
  - file://edge_cases/*.yaml
```

## CSV Format

CSV is ideal for bulk test data:

```yaml title="promptfooconfig.yaml"
tests: file://test_cases.csv
```

### Basic CSV

```csv title="test_cases.csv"
question,expectedAnswer
"What is 2+2?","4"
"What is the capital of France?","Paris"
"Who wrote Romeo and Juliet?","Shakespeare"
```

Variables are automatically mapped from column headers.

### CSV with Assertions

Use special `__expected` columns for assertions:

```csv title="test_cases.csv"
input,__expected
"Hello world","contains: Hello"
"Calculate 5 * 6","equals: 30"
"What's the weather?","llm-rubric: Provides weather information"
```

Multiple assertions:

```csv title="test_cases.csv"
question,__expected1,__expected2,__expected3
"What is 2+2?","equals: 4","contains: four","javascript: output.length < 10"
```

:::note
**contains-any** and **contains-all** expect comma-delimited values inside the `__expected` column.

```csv title="test_cases.csv"
translated_text,__expected
"<span>Hola</span> <b>mundo</b>","contains-any: <b>,</span>"
```

If you write `"contains-any: <b> </span>"`, promptfoo treats `<b> </span>` as a single search term rather than two separate tags.
:::

### Special CSV Columns

| Column                            | Purpose                    | Example             |
| --------------------------------- | -------------------------- | ------------------- |
| `__expected`                      | Single assertion           | `contains: Paris`   |
| `__expected1`, `__expected2`, ... | Multiple assertions        | `equals: 42`        |
| `__description`                   | Test description           | `Basic math test`   |
| `__prefix`                        | Prepend to prompt          | `You must answer: ` |
| `__suffix`                        | Append to prompt           | ` (be concise)`     |
| `__metric`                        | Metric name for assertions | `accuracy`          |
| `__threshold`                     | Pass threshold             | `0.8`               |
| `__metadata:*`                    | Filterable metadata        | See below           |

Using `__metadata` without a key is not supported. Specify the metadata field like `__metadata:category`.
If a CSV file includes a `__metadata` column without a key, Promptfoo logs a warning and ignores the column.

### Metadata in CSV

Add filterable metadata:

```csv title="test_cases.csv"
question,__expected,__metadata:category,__metadata:difficulty
"What is 2+2?","equals: 4","math","easy"
"Explain quantum physics","llm-rubric: Accurate explanation","science","hard"
```

Array metadata with `[]`:

```csv
topic,__metadata:tags[]
"Machine learning","ai,technology,data science"
"Climate change","environment,science,global\,warming"
```

Filter tests:

```bash
promptfoo eval --filter-metadata category=math
promptfoo eval --filter-metadata difficulty=easy
promptfoo eval --filter-metadata tags=ai
```

### JSON in CSV

Include structured data:

```csv title="test_cases.csv"
query,context,__expected
"What's the temperature?","{""location"":""NYC"",""units"":""celsius""}","contains: celsius"
```

Access in prompts:

```yaml
prompts:
  - 'Query: {{query}}, Location: {{(context | load).location}}'
```

## Dynamic Test Generation

Generate tests programmatically:

### JavaScript/TypeScript

```yaml title="promptfooconfig.yaml"
tests: file://generate_tests.js
```

```javascript title="generate_tests.js"
module.exports = async function () {
  // Fetch data, compute test cases, etc.
  const testCases = [];

  for (let i = 1; i <= 10; i++) {
    testCases.push({
      description: `Test case ${i}`,
      vars: {
        number: i,
        squared: i * i,
      },
      assert: [
        {
          type: 'contains',
          value: String(i * i),
        },
      ],
    });
  }

  return testCases;
};
```

### Python

```yaml title="promptfooconfig.yaml"
tests: file://generate_tests.py:create_tests
```

```python title="generate_tests.py"
import json

def create_tests():
    test_cases = []

    # Load test data from database, API, etc.
    test_data = load_test_data()

    for item in test_data:
        test_cases.append({
            "vars": {
                "input": item["input"],
                "context": item["context"]
            },
            "assert": [{
                "type": "contains",
                "value": item["expected"]
            }]
        })

    return test_cases
```

### With Configuration

Pass configuration to generators:

```yaml title="promptfooconfig.yaml"
tests:
  - path: file://generate_tests.py:create_tests
    config:
      dataset: 'validation'
      category: 'math'
      sample_size: 100
```

```python title="generate_tests.py"
def create_tests(config):
    dataset = config.get('dataset', 'train')
    category = config.get('category', 'all')
    size = config.get('sample_size', 50)

    # Use configuration to generate tests
    return generate_test_cases(dataset, category, size)
```

## JSON/JSONL Format

### JSON Array

```json title="tests.json"
[
  {
    "vars": {
      "topic": "artificial intelligence"
    },
    "assert": [
      {
        "type": "contains",
        "value": "AI"
      }
    ]
  },
  {
    "vars": {
      "topic": "climate change"
    },
    "assert": [
      {
        "type": "llm-rubric",
        "value": "Discusses environmental impact"
      }
    ]
  }
]
```

### JSONL (One test per line)

```jsonl title="tests.jsonl"
{"vars": {"x": 5, "y": 3}, "assert": [{"type": "equals", "value": "8"}]}
{"vars": {"x": 10, "y": 7}, "assert": [{"type": "equals", "value": "17"}]}
```

## Loading Media Files

Include images, PDFs, and other files as variables:

```yaml title="promptfooconfig.yaml"
tests:
  - vars:
      image: file://images/chart.png
      document: file://docs/report.pdf
      data: file://data/config.yaml
```

### Supported File Types

| Type                    | Handling            | Usage             |
| ----------------------- | ------------------- | ----------------- |
| Images (png, jpg, etc.) | Converted to base64 | Vision models     |
| Videos (mp4, etc.)      | Converted to base64 | Multimodal models |
| PDFs                    | Text extraction     | Document analysis |
| Text files              | Loaded as string    | Any use case      |
| YAML/JSON               | Parsed to object    | Structured data   |

### Example: Vision Model Test

```yaml
tests:
  - vars:
      image: file://test_image.jpg
      question: 'What objects are in this image?'
    assert:
      - type: contains
        value: 'dog'
```

In your prompt:

```json
[
  {
    "role": "user",
    "content": [
      { "type": "text", "text": "{{question}}" },
      {
        "type": "image_url",
        "image_url": {
          "url": "data:image/jpeg;base64,{{image}}"
        }
      }
    ]
  }
]
```

## Best Practices

### 1. Organize Test Data

```
project/
├── promptfooconfig.yaml
├── prompts/
│   └── main_prompt.txt
└── tests/
    ├── basic_functionality.csv
    ├── edge_cases.yaml
    └── regression_tests.json
```

### 2. Use Descriptive Names

```yaml
tests:
  - description: 'Test French translation with formal tone'
    vars:
      text: 'Hello'
      language: 'French'
      tone: 'formal'
```

### 3. Group Related Tests

```yaml
# Use metadata for organization
tests:
  - vars:
      query: 'Reset password'
    metadata:
      feature: authentication
      priority: high
```

### 4. Combine Approaches

```yaml
tests:
  # Quick smoke tests inline
  - vars:
      test: 'quick check'

  # Comprehensive test suite from file
  - file://tests/full_suite.csv

  # Dynamic edge case generation
  - file://tests/generate_edge_cases.js
```

## Common Patterns

### A/B Testing Variables

```csv title="ab_tests.csv"
message_style,greeting,__expected
"formal","Good morning","contains: Good morning"
"casual","Hey there","contains: Hey"
"friendly","Hello!","contains: Hello"
```

### Error Handling Tests

```yaml
tests:
  - description: 'Handle empty input'
    vars:
      input: ''
    assert:
      - type: contains
        value: 'provide more information'
```

### Performance Tests

```yaml
tests:
  - vars:
      prompt: 'Simple question'
    assert:
      - type: latency
        threshold: 1000 # milliseconds
```

## Loading from Google Sheets

See [Google Sheets integration](/docs/configuration/guide#loading-tests-from-csv) for details on loading test data directly from spreadsheets.

## Loading from HuggingFace datasets

See [HuggingFace Datasets](/docs/configuration/huggingface-datasets) for instructions on importing test cases from existing datasets.
