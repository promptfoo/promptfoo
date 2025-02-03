---
sidebar_position: 2
---

# CSV Tests

Loading test cases from CSV files is a simple and effective way to manage your prompts and test data. Whether you're using local files or Google Sheets, promptfoo makes it easy to evaluate your LLMs using spreadsheet data.

## Quick Start

```yaml
# Load from a local CSV file
tests: file://tests.csv

# Or directly from Google Sheets
tests: https://docs.google.com/spreadsheets/d/your-sheet-id/edit

# Or combine with other sources
tests:
  - file://tests.csv
  - huggingface://datasets/cais/mmlu
  - vars:
      input: "Direct test case"
      expected: "Expected output"
```

:::tip
See the [Datasets Overview](/docs/configuration/datasets) for all available data sources and the [Google Sheets guide](/docs/configuration/tests/google-sheets) for detailed spreadsheet setup.
:::

## CSV Format

Your CSV file should have headers that match the variables you want to use in your prompts:

```csv
input,expected_output,temperature,max_tokens
"Summarize this:","A concise summary",0.7,150
"Translate to Spanish:","Hola mundo",0.5,100
```

### Supported Columns

| Column Type      | Description                          | Example                                |
| ---------------- | ------------------------------------ | -------------------------------------- |
| Variables        | Any column name becomes a variable   | `input`, `context`, `language`         |
| Provider Options | Columns matching provider parameters | `temperature`, `max_tokens`            |
| Assertions       | Special columns for expected outputs | `expected_output`, `expected_contains` |
| Metadata         | Additional test information          | `description`, `tags`                  |

### Special Columns

Some column names have special meaning:

- `expected_output`: Used for exact match assertions
- `expected_contains`: Checks if output contains this text
- `expected_regex`: Matches output against a regex pattern
- `expected_similarity`: Used with similarity assertions
- `assert`: JSON-formatted assertion objects
- `description`: Test case description
- `tags`: Comma-separated test tags

## Example Configurations

### Basic Testing

```yaml
prompts:
  - |
    Write a {{tone}} message about {{topic}}
    Make it approximately {{length}} words long.

providers:
  - openai:gpt-4

tests: file://marketing_tests.csv
```

marketing_tests.csv:

```csv
topic,tone,length,expected_contains
"new product launch","professional",50,"introducing our new"
"holiday sale","festive",30,"season's greetings"
"customer feedback","sincere",40,"thank you for your feedback"
```

### Advanced Assertions

```yaml
prompts:
  - '{{input}}'

providers:
  - openai:gpt-4

tests: file://advanced_tests.csv

defaultTest:
  assert:
    - type: similar
      threshold: 0.7
```

advanced_tests.csv:

```csv
input,expected_output,assert
"Summarize: The cat sat on the mat","A cat was sitting on a mat","[{""type"": ""similar"", ""value"": ""{{expected_output}}"", ""threshold"": 0.8}, {""type"": ""length"", ""max"": 50}]"
```

### Provider Configuration

```yaml
prompts:
  - '{{prompt}}'

tests: file://provider_tests.csv
```

provider_tests.csv:

```csv
prompt,temperature,max_tokens,top_p
"Write creatively:","0.9",150,0.95
"Write precisely:","0.2",100,0.5
```

## Best Practices

1. **Use Headers**: Always include clear column headers that match your prompt variables
2. **Validate CSV**: Ensure your CSV is properly formatted and encoded (UTF-8 recommended)
3. **Start Small**: Begin with a few test cases to validate your setup
4. **Use Descriptions**: Add a description column to document test case purposes
5. **Group Related Tests**: Use tags to organize and filter test cases
6. **Version Control**: Keep your CSV files in version control alongside your configs
7. **Handle Special Characters**: Properly escape quotes and commas in CSV values

## Related Resources

- [Loading from HuggingFace Datasets](/docs/configuration/tests/huggingface)
- [Google Sheets Integration](/docs/integrations/google-sheets)
- [Configuration Guide](/docs/configuration/guide)

## Troubleshooting

### Common Issues

#### CSV Parsing Errors

- Check for proper CSV formatting
- Ensure columns match expected names
- Verify character encoding (use UTF-8)
- Properly escape special characters

#### Google Sheets Access

- Verify sheet permissions (must be accessible)
- Check sheet ID is correct
- Ensure proper authentication if using private sheets

#### Variable References

- Confirm column headers match prompt variables
- Check for case sensitivity
- Verify no spaces in column headers
