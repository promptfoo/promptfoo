# Simple CSV Example

This example demonstrates how to use CSV files for test cases, including working with JSON fields and structured prompts.

## Features Demonstrated

- CSV test case format with JSON fields
- Multiple prompt variations
- Style configuration via JSON
- Test assertions

## Files

- `promptfooconfig.yaml`: Main configuration file
- `prompts.txt`: Contains the prompt templates
- `tests.csv`: Test cases with variables and style configuration

## Usage

```bash
promptfoo eval
```

## CSV Format

The `tests.csv` file shows how to:

- Use JSON fields in CSV (with proper quoting)
- Configure style parameters
- Include test assertions

Example row:

```csv
language,body,style_config,__expected
French,"Hello world","{""tone"":""formal"",""length"":""brief""}","Must contain 'Bonjour'"
```

Note: When including JSON in CSV fields, you need to:

1. Quote the entire JSON string with double quotes
2. Double up the quotes within the JSON itself
   This ensures the CSV parser correctly handles the commas within the JSON object.
