# csv-metadata (# CSV Metadata Example)

You can run this example with:

```bash
npx promptfoo@latest init --example csv-metadata
```

This example demonstrates how to use metadata columns in CSV and Excel test files to organize and filter your test cases. You can see more details on how to build test cases from CSV in the [Promptfoo docs](https://www.promptfoo.dev/docs/configuration/test-cases/#csv-format)

### Files

- `promptfooconfig.yaml`: Configuration file with a simple prompt and provider setup
- `tests.csv`: Test cases with metadata columns for categorization and filtering
- `tests.xlsx`: Same test cases in Excel format (optional - requires `npm install read-excel-file`)

### Metadata Columns

The CSV/Excel file includes two types of metadata columns:

1. `__metadata:category` - Single value metadata for broad categorization
2. `__metadata:tags[]` - Array metadata for multiple tags, with comma separation and escape support

### Running the Example

Basic evaluation:

```bash
promptfoo eval
```

To use Excel file instead of CSV:

```bash
# First install the read-excel-file package
npm install read-excel-file

# Then run with Excel file
promptfoo eval -c promptfooconfig.yaml -t file://tests.xlsx
```

Filter by category:

```bash
promptfoo eval --filter-metadata category=technology
```

Filter by tags:

```bash
promptfoo eval --filter-metadata tags=ai
```

Note that array metadata values (tags) support escaped commas. For example, "global\,warming" is treated as a single tag.

### Expected Output

The example includes basic assertions using the `__expected` column to verify outputs contain relevant keywords.
