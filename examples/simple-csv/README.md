# Simple CSV Example

This example demonstrates how to use CSV files for test cases, including working with JSON fields for language translation tasks.

## Features Demonstrated

- CSV test case format with JSON configuration fields
- Multiple prompt variations for different translation styles
- Style configuration via JSON fields (tone, length)
- Case-insensitive test assertions (icontains)

## Files

- `promptfooconfig.yaml`: Main configuration file
- `prompts.txt`: Contains two prompt templates:
  1. A formal translator prompt
  2. A conversational language assistant prompt
- `tests.csv`: Test cases for French and Pirate translations

## Usage

```bash
promptfoo eval
```

## CSV Format

The `tests.csv` file demonstrates:

1. Basic structure:

```csv
language,body,style_config,__expected
French,"Hello world",{"tone":"formal","length":"brief"},"icontains:bonjour"
```

2. Fields:

- `language`: Target language for translation
- `body`: Text to translate
- `style_config`: JSON object with style parameters
- `__expected`: Test assertion using icontains
