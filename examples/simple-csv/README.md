# simple-csv (Simple CSV Example)

You can run this example with:

```bash
npx promptfoo@latest init --example simple-csv
```

This example demonstrates how to use CSV and Excel files for test cases in promptfoo, including working with JSON fields for language translation tasks.

## Getting Started

You can initialize this example in your project by running:

```bash
promptfoo init --example simple-csv
```

## Features Demonstrated

- CSV and Excel (XLSX) test case formats with JSON configuration fields
- Multiple prompt variations for different translation styles
- Style configuration via JSON fields (tone, length)
- Case-insensitive test assertions (icontains)

## Project Structure

- `promptfooconfig.yaml`: Main configuration file
- `prompts.txt`: Contains two prompt templates:
  1. A formal translator prompt
  2. A conversational language assistant prompt
- `tests.csv`: Test cases for French and Pirate translations
- `tests.xlsx`: Same test cases in Excel format (optional)

## Using Excel Files

To use Excel files instead of CSV:

1. Install the xlsx package (optional peer dependency):

   ```bash
   npm install xlsx
   ```

2. Update `promptfooconfig.yaml` to use the Excel file:
   ```yaml
   tests: file://tests.xlsx
   ```

Excel files work exactly like CSV files - each row becomes a test case, and column headers become variable names.

## Running the Tests

From the root of this example, you can run the eval as:

```bash
promptfoo eval
```

To view the results in your browser:

```bash
promptfoo view
```

For more details on using CSV and Excel files in promptfoo, see our [Import from CSV](https://www.promptfoo.dev/docs/configuration/test-cases/#import-from-csv) documentation.
