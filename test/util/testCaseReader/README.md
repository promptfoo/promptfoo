# Test Case Reader Tests

This directory contains comprehensive tests for the `testCaseReader` utility functions. The tests have been organized by functionality to improve maintainability and clarity.

## Test Files

### standaloneTestsFile.test.ts

Tests for `readStandaloneTestsFile` function - reading standalone test files in various formats:

- CSV files (with and without BOM)
- JSON and JSONL files
- YAML files
- Google Sheets
- JavaScript modules
- Python scripts
- File path handling and environment variables

### singleTestCase.test.ts

Tests for `readTest` function - processing individual test cases:

- Loading from file paths
- Handling TestCase objects
- Expanding glob patterns in vars
- Provider loading

### multipleTestCases.test.ts

Tests for `readTests` function - processing arrays and collections of test cases:

- CSV file loading with multiple rows
- Multiple file paths
- Google Sheets integration
- HuggingFace datasets
- Python generators
- Warning handling

### csvRowConversion.test.ts

Tests for `testCaseFromCsvRow` function - converting CSV rows to TestCase format:

- Special column handling (**expected, **prefix, \_\_suffix)

### varsFileReader.test.ts

Tests for `readTestFiles` function - loading variables from external files:

- Single YAML file loading
- Multiple file merging

### globPatternLoader.test.ts

Tests for `loadTestsFromGlob` function - loading tests using glob patterns:

- HuggingFace dataset URLs

### csvJsonFieldParsing.test.ts

Tests for CSV parsing with JSON fields:

- Properly escaped JSON fields
- Relaxed parsing for unescaped JSON
- Strict mode enforcement
- Error propagation

## Running Tests

To run all tests in this directory:

```bash
npx jest test/util/testCaseReader
```

To run a specific test file:

```bash
npx jest test/util/testCaseReader/standaloneTestsFile.test.ts
```

## Test Count

Total: 57 tests across 7 files
