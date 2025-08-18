# echo-1000-tests

A demonstration of promptfoo's echo provider with 1000 programmatically generated test cases, showcasing various assertion types and testing patterns at scale.

You can run this example with:

```bash
npx promptfoo@latest init --example echo-1000-tests
```

## Overview

This example demonstrates:

- Using the `echo` provider (which simply returns its input)
- Generating test cases programmatically with Python
- Various assertion types (equals, contains, regex, javascript, python, etc.)
- Testing at scale with 1000 test cases
- Parallel test execution for performance

## Prerequisites

- Node.js 18+ and npm
- Python 3.7+ (for generating test cases)
- (Optional) PyYAML for YAML output: `pip install pyyaml`

## Files

- `generate-tests.py` - Python script to generate 1000 test cases
- `simple-example.yaml` - Simple handwritten example showing the config structure
- `promptfooconfig.yaml` - Generated promptfoo configuration (YAML format)
- `promptfooconfig.json` - Generated promptfoo configuration (JSON format)
- `output.csv` - Test results (generated after running evaluation)

## Step-by-Step Instructions

### 1. Generate the Test Cases

First, run the Python script to generate the test configuration:

```bash
cd examples/echo-1000-tests
python generate-tests.py
```

This will create:

- `promptfooconfig.yaml` - YAML configuration with 1000 test cases
- `promptfooconfig.json` - JSON configuration (alternative format)

### 2. Run the Evaluation

Execute the tests using promptfoo:

```bash
# Using YAML config
npx promptfoo@latest eval -c promptfooconfig.yaml

# Or using JSON config
npx promptfoo@latest eval -c promptfooconfig.json

# For faster execution with more parallel workers
npx promptfoo@latest eval -c promptfooconfig.yaml --max-concurrency 20
```

### 3. View Results

After the evaluation completes, you can:

1. View results in the terminal (summary will be displayed)
2. Open the web UI: `npx promptfoo@latest view`
3. Check the CSV output: `output.csv`

## Test Case Categories

The Python script generates test cases in 8 different categories:

1. **Greeting** - Simple greeting messages with exact match assertions
2. **Question** - Questions that should contain "?"
3. **Command** - Commands with case-insensitive contains assertions
4. **Statement** - Statements checked with regex patterns
5. **Calculation** - Math expressions validated with JavaScript
6. **Story** - Story prompts with Python length checks
7. **Technical** - Technical terms with contains assertions
8. **Creative** - Creative prompts with various validation types

## Assertion Types Used

This example demonstrates various assertion types:

- `equals` - Exact string match
- `contains` - Substring check
- `icontains` - Case-insensitive substring check
- `regex` - Regular expression pattern matching
- `javascript` - Custom JavaScript validation
- `python` - Custom Python validation
- `is-json` - JSON format validation

## Performance Optimization

You can optimize performance by:

- Increasing `--max-concurrency` when running eval
- Using the JSON config format (slightly faster parsing)
- Running with `--no-cache` if testing changes

## Customization

You can modify `generate-tests.py` to:

1. **Change the number of tests**:

   ```python
   test_cases = generate_test_cases(500)  # Generate 500 instead of 1000
   ```

2. **Add new categories**:

   ```python
   categories = ["greeting", "question", "command", "custom_category"]
   ```

3. **Modify assertion logic**:

   ```python
   test_case["assert"] = [
       {"type": "your_assertion", "value": "your_value"}
   ]
   ```

4. **Use different providers**:
   ```python
   config["providers"] = ["openai:gpt-4o-mini", "anthropic:claude-3-haiku"]
   ```

## Expected Output

When running the evaluation, you should see:

- All 1000 tests passing (since echo returns exact input)
- Performance metrics showing test execution time
- A summary of pass/fail rates by assertion type

Example output:

```
✓ Test case 1: greeting test
✓ Test case 2: question test
✓ Test case 3: command test
...
✓ Test case 1000: creative test

Tests: 1000 pass, 0 fail
Assertions: 1200 pass, 0 fail
```

## Understanding the Echo Provider

The `echo` provider is a special built-in provider that:

- Returns exactly what it receives as input
- Useful for testing the test framework itself
- Helps validate assertion logic without API calls
- Perfect for large-scale testing demonstrations

## Troubleshooting

If you encounter issues:

1. **PyYAML not installed**: Install with `pip install pyyaml` or use the JSON config
2. **Tests failing**: Check that the echo provider is returning exact input
3. **Performance issues**: Reduce parallel workers or number of tests
4. **Memory issues**: Process tests in smaller batches

## Next Steps

After exploring this example, you might want to:

1. Replace `echo` with real LLM providers
2. Add more complex assertion logic
3. Integrate with CI/CD pipelines
4. Export results to other formats
5. Create custom grading functions

## Related Examples

- `simple-test` - Basic promptfoo configuration
- `custom-grader-csv` - Custom grading with CSV data
- `assertions-generate` - Generating assertions automatically
- `python-assert-validation-demo` - Python-based assertion validation
