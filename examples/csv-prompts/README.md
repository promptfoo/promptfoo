# CSV Prompts

This example demonstrates how to use CSV files to define prompts in promptfoo.

You can run this example with:

```bash
npx promptfoo@latest init --example csv-prompts
```

## Overview

CSV (Comma-Separated Values) files provide a simple, tabular format for defining multiple prompts. This can be useful when:

- Working with a large number of prompts
- Managing prompts in a spreadsheet
- Collaborating with team members who prefer spreadsheet tools
- Importing prompts from other systems

## Files in this Example

- `promptfooconfig.yaml` - Main configuration file that references the CSV prompt file
- `prompts.csv` - CSV file with prompt text and optional labels
- `single-column.csv` - Simple CSV with just a prompt column and header
- `two-column.csv` - CSV with prompt and label columns
- `no-header.csv` - CSV with no header row (each line is a prompt)

## CSV Format Options

### Single-Column Format

The simplest CSV prompt format has a single column with either a "prompt" header or no header at all:

```csv
prompt
"Tell me about {{topic}}"
"Explain {{topic}} in simple terms"
"Write a poem about {{topic}}"
```

Or without a header:

```csv
"Tell me about {{topic}}"
"Explain {{topic}} in simple terms"
"Write a poem about {{topic}}"
```

### Two-Column Format

For better organization, you can include a "label" column to give each prompt a descriptive name:

```csv
prompt,label
"Tell me about {{topic}}","Basic Query"
"Explain {{topic}} in simple terms","Simple Explanation"
"Write a poem about {{topic}}","Poetry Generator"
```

## Modifying This Example

1. Try changing the CSV file referenced in `promptfooconfig.yaml` to use the different formats:

```yaml
prompts:
  - file://single-column.csv
  # or
  - file://two-column.csv
  # or
  - file://no-header.csv
```

2. Add your own prompts to the CSV files
3. Uncomment the provider lines in `promptfooconfig.yaml` to use actual LLM providers
4. Run the evaluation with `npx promptfoo eval`

## CSV Processing Rules

- Rows with missing prompt values are skipped
- For single-column CSVs, if the first row contains "prompt", it's treated as a header and skipped
- If a label isn't provided, a numeric label is generated (e.g., "Prompt 1", "Prompt 2")
- CSV parsing can be customized with environment variables:
  - `PROMPTFOO_CSV_DELIMITER` - Set the delimiter character (default: ',')
  - `PROMPTFOO_CSV_STRICT` - Toggle strict quote handling (default: false)
- CSV formatting follows standard CSV rules (quote escaping, etc.)
