---
sidebar_position: 2
---

# CSV Tests

CSV files provide a simple, spreadsheet-based way to manage your prompt test cases. This format is particularly useful for:

- Non-technical team members
- Large-scale test management
- Collaborative test development
- Integration with existing data workflows

## Quick Start

### Basic Setup

1. Create a CSV file with your test cases:

```csv title="tests.csv"
input,expected_output
"What is 2+2?","4"
"List three colors","red, blue, green"
```

2. Reference it in your config:

```yaml title="promptfooconfig.yaml"
tests: file://tests.csv
```

### Alternative Sources

```yaml
# Load from Google Sheets
tests: https://docs.google.com/spreadsheets/d/your-sheet-id/edit

# Combine with other sources
tests:
  - file://regression_tests.csv
  - file://accuracy_tests.csv
  - huggingface://datasets/cais/mmlu
```

:::tip
See the [Google Sheets guide](/docs/configuration/tests/google-sheets) for detailed spreadsheet setup instructions.
:::

## CSV Format Details

### Basic Structure

- Use UTF-8 encoding
- First row must contain column headers
- Column names become variables in your prompts
- Supports both comma (,) and tab delimiters
- Handles quoted values for multi-line text

```csv title="Example with various data types"
input,context,expected_output,temperature,max_tokens
"Summarize this:","Long text here...","A concise summary",0.7,150
"Multi-line
prompt","Additional
context","Expected
result",0.5,100
```

### Column Types

#### Required Columns

At least one of these must be present:

- Any variable used in your prompts (e.g., `input`, `context`)
- Any assertion column (e.g., `expected_output`, `expected_contains`)

#### Special Assertion Columns

| Column Name           | Description                  | Example                  |
| --------------------- | ---------------------------- | ------------------------ |
| `expected_output`     | Exact match assertion        | `"The answer is 42"`     |
| `expected_contains`   | Substring match              | `"must include this"`    |
| `expected_regex`      | Regular expression match     | `"\\d+ items found"`     |
| `expected_similarity` | Semantic similarity check    | `"Similar meaning text"` |
| `expected_json`       | JSON structure validation    | `{"key": "value"}`       |
| `assert`              | Custom JSON assertion object | `[{"type": "contains"}]` |

For multiple assertions, use numbered columns:

```csv
input,expected_output1,expected_output2,expected_contains1
"Query","First check","Second check","Must contain"
```

#### Provider Configuration Columns

Any column matching a provider parameter will be used for configuration:

| Column              | Description       | Example |
| ------------------- | ----------------- | ------- |
| `temperature`       | Model temperature | `0.7`   |
| `max_tokens`        | Maximum tokens    | `150`   |
| `top_p`             | Top-p sampling    | `0.95`  |
| `frequency_penalty` | Frequency penalty | `0.5`   |
| `presence_penalty`  | Presence penalty  | `0.5`   |

#### Metadata Columns

Special `__` prefixed columns for test metadata:

| Column          | Description          | Example              |
| --------------- | -------------------- | -------------------- |
| `__description` | Test description     | `"Tests basic math"` |
| `__prefix`      | Prepended to prompt  | `"Context: "`        |
| `__suffix`      | Appended to prompt   | `" Answer:"`         |
| `__metric`      | Default metric       | `"similarity"`       |
| `__threshold`   | Assertion threshold  | `0.8`                |
| `__tags`        | Comma-separated tags | `"regression,math"`  |

## Examples

### Basic Testing

```yaml title="promptfooconfig.yaml"
prompts:
  - |
    Write a {{tone}} message about {{topic}}
    Make it approximately {{length}} words long.

providers:
  - openai:o3-mini

tests: file://marketing_tests.csv
```

```csv title="marketing_tests.csv"
topic,tone,length,expected_contains,__description
"new product","professional",50,"introducing our new","Product launch email"
"holiday sale","festive",30,"season's greetings","Holiday promotion"
"feedback","sincere",40,"thank you","Customer response"
```

### Advanced Assertions

```yaml title="promptfooconfig.yaml"
prompts:
  - '{{input}}'
tests: file://advanced_tests.csv
```

```csv title="advanced_tests.csv"
input,expected_output,assert,__threshold
"Summarize: The cat sat on the mat","A cat was sitting on a mat","[{""type"": ""similar""}, {""type"": ""length"", ""max"": 50}]",0.8
```

### Multi-line Text

For prompts or expected outputs containing multiple lines:

```csv
input,expected_output
"Write a poem
about cats","First line
Second line
Third line"
```

## Best Practices

### File Organization

1. **Separate Concerns**
   - Split different test types into separate files
   - Use clear, descriptive filenames
   - Group related tests together

2. **Version Control**
   - Keep CSV files in version control
   - Use consistent formatting
   - Include header comments

### Data Quality

1. **Validation**
   - Verify column names match prompt variables
   - Check for proper CSV formatting
   - Validate assertion syntax
   - Test with small datasets first

2. **Maintenance**
   - Document test purposes
   - Use consistent naming conventions
   - Regular cleanup of obsolete tests
   - Keep test cases focused and atomic

### Collaboration

1. **Documentation**
   - Use `__description` for each test
   - Add comments for complex assertions
   - Document expected behaviors
   - Include example outputs

2. **Workflow**
   - Use Google Sheets for team editing
   - Export to CSV for version control
   - Regular review and updates
   - Clear ownership and responsibilities

## Troubleshooting

### Common Issues

1. **CSV Parsing Errors**
   - Ensure UTF-8 encoding
   - Check for proper escaping of quotes and commas
   - Verify no hidden characters
   - Validate CSV format with a tool

2. **Variable Reference Errors**
   - Column names must exactly match prompt variables
   - Check for case sensitivity
   - Avoid spaces in column names
   - Verify all required columns exist

3. **Google Sheets Integration**
   - Sheet must be accessible
   - Correct sheet ID in URL
   - Proper authentication for private sheets
   - Correct sheet name/range

### Debug Tips

- Use `promptfoo eval --debug` for detailed logs
- Validate CSV with external tools
- Test with minimal examples first
- Check file permissions

## Related Resources

- [Configuration Guide](/docs/configuration/guide)
- [Google Sheets Integration](/docs/configuration/tests/google-sheets)
- [Test Configuration Overview](/docs/configuration/tests)
- [Assertion Types](/docs/configuration/expected-outputs)
