# Simple CSV Example

This example demonstrates how to use CSV files for test cases in promptfoo, including working with JSON fields for language translation tasks.

## Getting Started

You can initialize this example in your project by running:

```bash
promptfoo init --example simple-csv
```

## Features Demonstrated

- CSV test case format with JSON configuration fields
- Multiple prompt variations for different translation styles
- Style configuration via JSON fields (tone, length)
- Case-insensitive test assertions (icontains)

## Project Structure

- `promptfooconfig.yaml`: Main configuration file
- `prompts.txt`: Contains two prompt templates:
  1. A formal translator prompt
  2. A conversational language assistant prompt
- `tests.csv`: Test cases for French and Pirate translations

## Running the Tests

From the root of this example, you can run the eval as:

```bash
promptfoo eval
```

To view the results in your browser:

```bash
promptfoo view
```

For more details on using CSV files in promptfoo, see our [Import from CSV](https://www.promptfoo.dev/docs/configuration/parameters/#import-from-csv) documentation.
