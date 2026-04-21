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

### Filtering Tests by Provider

Control which providers run specific tests using the `providers` field. This allows you to run different test suites against different models in a single evaluation:

```yaml
providers:
  - id: openai:gpt-3.5-turbo
    label: fast-model
  - id: openai:gpt-4
    label: smart-model

tests:
  # Only run on fast-model
  - vars:
      question: 'What is 2 + 2?'
    providers:
      - fast-model
    assert:
      - type: equals
        value: '4'

  # Only run on smart-model
  - vars:
      question: 'Explain quantum entanglement'
    providers:
      - smart-model
    assert:
      - type: llm-rubric
        value: 'Provides accurate physics explanation'
```

**Matching syntax:**

| Pattern        | Matches                                                              |
| -------------- | -------------------------------------------------------------------- |
| `fast-model`   | Exact label match                                                    |
| `openai:gpt-4` | Exact provider ID match                                              |
| `openai:*`     | Wildcard - any provider starting with `openai:`                      |
| `openai`       | Legacy prefix - matches `openai:gpt-4`, `openai:gpt-3.5-turbo`, etc. |

**Apply to all tests using `defaultTest`:**

```yaml
defaultTest:
  providers:
    - openai:* # All tests default to OpenAI providers only

tests:
  - vars:
      question: 'Simple question'
  - vars:
      question: 'Complex question'
    providers:
      - smart-model # Override default for this test
```

**Edge cases:**

- **No filter**: Without the `providers` field, the test runs against all providers (cross-product behavior)
- **Empty array**: `providers: []` means the test runs on no providers and is effectively skipped
- **Stacking with providerPromptMap**: When both `providers` and `providerPromptMap` are set, they filter together—a provider must match both to run
- **CLI `--filter-providers`**: If you use `--filter-providers` to filter providers at the CLI level, validation only sees the filtered providers. Tests referencing providers excluded by `--filter-providers` will fail validation

### Filtering Tests by Prompt

By default, each test runs against all prompts (a cartesian product). You can use the `prompts` field to restrict a test to specific prompts:

```yaml
prompts:
  - id: prompt-factual
    label: Factual Assistant
    raw: 'You are a factual assistant. Answer: {{question}}'
  - id: prompt-creative
    label: Creative Writer
    raw: 'You are a creative writer. Answer: {{question}}'

providers:
  - openai:gpt-4o-mini

tests:
  # This test only runs with the Factual Assistant prompt
  - vars:
      question: 'What is the capital of France?'
    prompts:
      - Factual Assistant
    assert:
      - type: contains
        value: 'Paris'

  # This test only runs with the Creative Writer prompt
  - vars:
      question: 'Write a poem about Paris'
    prompts:
      - prompt-creative # You can reference by ID or label
    assert:
      - type: llm-rubric
        value: 'Contains poetic language'

  # This test runs with all prompts (default behavior)
  - vars:
      question: 'Hello'
```

The `prompts` field accepts:

- **Exact labels**: `prompts: ['Factual Assistant']`
- **Exact IDs**: `prompts: ['prompt-factual']`
- **Wildcard patterns**: `prompts: ['Math:*']` matches `Math:Basic`, `Math:Advanced`, etc.
- **Prefix patterns**: `prompts: ['Math']` matches `Math:Basic`, `Math:Advanced` (legacy syntax)

:::note

Invalid prompt references will cause an error at config load time. This strict validation catches typos early.

:::

You can also set a default prompt filter in `defaultTest`:

```yaml
defaultTest:
  prompts:
    - Factual Assistant

tests:
  # Inherits prompts: ['Factual Assistant'] from defaultTest
  - vars:
      question: 'What is 2+2?'

  # Override to use a different prompt
  - vars:
      question: 'Write a story'
    prompts:
      - Creative Writer
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

CSV or Excel (XLSX) files are ideal for bulk test data:

```yaml title="promptfooconfig.yaml"
tests: file://test_cases.csv
```

```yaml title="promptfooconfig.yaml"
tests: file://test_cases.xlsx
```

### Basic CSV

```csv title="test_cases.csv"
question,expectedAnswer
"What is 2+2?","4"
"What is the capital of France?","Paris"
"Who wrote Romeo and Juliet?","Shakespeare"
```

Variables are automatically mapped from column headers.

### Excel (XLSX/XLS) Support

Excel files (.xlsx and .xls) are supported as an optional feature. To use Excel files:

1. Install the `read-excel-file` package as a peer dependency:

   ```bash
   npm install read-excel-file
   ```

2. Use Excel files just like CSV files:
   ```yaml title="promptfooconfig.yaml"
   tests: file://test_cases.xlsx
   ```

**Multi-sheet support:** By default, only the first sheet is used. To specify a different sheet, use the `#` syntax:

- `file://test_cases.xlsx#Sheet2` - Select sheet by name
- `file://test_cases.xlsx#2` - Select sheet by 1-based index (2 = second sheet)

```yaml title="promptfooconfig.yaml"
# Use a specific sheet by name
tests: file://test_cases.xlsx#DataSheet

# Or by index (1-based)
tests: file://test_cases.xlsx#2
```

### XLSX Example

Your Excel file should have column headers in the first row, with each subsequent row representing a test case:

| question                       | expectedAnswer |
| ------------------------------ | -------------- |
| What is 2+2?                   | 4              |
| What is the capital of France? | Paris          |
| Name a primary color           | blue           |

**Tips for Excel files:**

- First row must contain column headers
- Column names become variable names in your prompts
- Empty cells are treated as empty strings
- Use `__expected` columns for assertions (same as CSV)

### CSV with Assertions

Use special `__expected` columns for assertions:

```csv title="test_cases.csv"
input,__expected
"Hello world","contains: Hello"
"Calculate 5 * 6","equals: 30"
"What's the weather?","llm-rubric: Provides weather information"
```

Values without a type prefix default to `equals`:

| `__expected` value                | Assertion type               |
| --------------------------------- | ---------------------------- |
| `Paris`                           | `equals`                     |
| `contains:Paris`                  | `contains`                   |
| `factuality:The capital is Paris` | `factuality`                 |
| `similar(0.8):Hello there`        | `similar` with 0.8 threshold |

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

| Column                                                      | Purpose                                                  | Example                                                           |
| ----------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| `__expected`                                                | Single assertion                                         | `contains: Paris`                                                 |
| `__expected1`, `__expected2`, ...                           | Multiple assertions                                      | `equals: 42`                                                      |
| `__description`                                             | Test description                                         | `Basic math test`                                                 |
| `__prefix`                                                  | Prepend to prompt                                        | `You must answer: `                                               |
| `__suffix`                                                  | Append to prompt                                         | ` (be concise)`                                                   |
| `__metric`                                                  | Display name in reports (does not change assertion type) | `accuracy`                                                        |
| `__threshold`                                               | Pass threshold (applies to all asserts)                  | `0.8`                                                             |
| `__metadata:*`                                              | Filterable metadata                                      | See below                                                         |
| `__config:__expected:<key>` or `__config:__expectedN:<key>` | Set configuration for all or specific assertions         | `__config:__expected:threshold`, `__config:__expected2:threshold` |

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

# Multiple filters use AND logic (tests must match ALL conditions)
promptfoo eval --filter-metadata category=math --filter-metadata difficulty=easy
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

### CSV with defaultTest

Apply the same assertions to all tests loaded from a CSV file using [`defaultTest`](/docs/configuration/guide#default-test-cases):

```yaml title="promptfooconfig.yaml"
defaultTest:
  assert:
    - type: factuality
      value: '{{reference_answer}}'
  options:
    provider: openai:gpt-5.2

tests: file://tests.csv
```

```csv title="tests.csv"
question,reference_answer
"What does GPT stand for?","Generative Pre-trained Transformer"
"What is the capital of France?","Paris is the capital of France"
```

Use regular column names (like `reference_answer`) instead of `__expected` when referencing values in `defaultTest` assertions. The `__expected` column automatically creates assertions per row.

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

### Path Resolution

`file://` paths are resolved relative to your **config file's directory**, not the current working directory. This ensures consistent behavior regardless of where you run `promptfoo` from:

```yaml title="src/tests/promptfooconfig.yaml"
tests:
  - vars:
      # Resolved as src/tests/data/input.json
      data: file://./data/input.json

      # Also works - resolved as src/tests/data/input.json
      data2: file://data/input.json

      # Parent directory - resolved as src/shared/context.json
      shared: file://../shared/context.json
```

Without the `file://` prefix, values are passed as plain strings to your provider.

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

### Passing Arrays to Assertions

By default, array variables expand into multiple test cases. To pass an array directly to assertions like `contains-any`, disable variable expansion:

```yaml
defaultTest:
  options:
    disableVarExpansion: true
  assert:
    - type: contains-any
      value: '{{expected_values}}'

tests:
  - description: 'Check for any valid response'
    vars:
      expected_values: ['option1', 'option2', 'option3']
```

## External Data Sources

### Google Sheets

See [Google Sheets integration](/docs/integrations/google-sheets) for details on loading test data directly from spreadsheets.

### SharePoint

See [SharePoint integration](/docs/integrations/sharepoint) for details on loading test data from Microsoft SharePoint document libraries.

### HuggingFace Datasets

See [HuggingFace Datasets](/docs/configuration/huggingface-datasets) for instructions on importing test cases from existing datasets.
