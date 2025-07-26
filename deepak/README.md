# Promptfoo Test Configuration

This directory contains promptfoo configurations for testing responses using the `selectbest_response.csv` file.

## Files

- `selectbest_response.csv` - Original test data (has formatting issues)
- `selectbest_response_corrected.csv` - **Corrected test data with proper CSV formatting**
- `promptfooconfig.yaml` - Basic configuration using corrected CSV
- `promptfooconfig-comparison.yaml` - Advanced configuration for comparing multiple providers
- `promptfooconfig-selectbest.yaml` - Specialized for "select best response" evaluation
- `validate-csv.py` - Python script to validate CSV formatting
- `CSV_CORRECTIONS_SUMMARY.md` - Details about the CSV corrections made

## ⚠️ Important: CSV Corrections

The original CSV file had formatting issues. Use `selectbest_response_corrected.csv` which has:
- Proper column headers: `prompt`, `answer`, `answer2`
- Correctly escaped HTML content
- Fixed corrupted nutrition information row
- Consistent formatting throughout

## Usage

### Basic Test Run
```bash
# Run with the basic configuration
promptfoo eval -c promptfooconfig.yaml

# View results in the web UI
promptfoo view
```

### Validate CSV Files
```bash
# Check CSV formatting
python validate-csv.py selectbest_response_corrected.csv
```

### Comparison Test Run
```bash
# Run with the comparison configuration
promptfoo eval -c promptfooconfig-comparison.yaml

# Results will be saved to results/comparison_results.csv
```

## Understanding Your CSV

Your CSV contains Sysco Foods customer service test cases:
- `prompt`: Customer questions about products, stock, delivery, nutrition
- `answer`: First response variation (concise)
- `answer2`: Second response variation (more detailed)

The corrected CSV properly handles:
- HTML formatting in responses
- Product codes (SUPC numbers)
- Dates and nutritional information
- Links to Sysco Shop

## Next Steps

1. **Test with current setup**: Run `promptfoo eval` to see how the echo/GPT-4.1-nano responds
2. **Add More Providers**: Compare different LLMs by adding them to the config
3. **Customize Assertions**: Adjust the similarity threshold or add specific checks
4. **Add More Test Cases**: Extend the CSV with additional customer queries

## Example: Adding Claude Provider

```yaml
providers:
  - id: anthropic:claude-3-haiku-20240307
    config:
      temperature: 0.3
```

## Running Specific Tests

```bash
# Run only tests containing "chicken"
promptfoo eval -c promptfooconfig.yaml --filter-metadata "prompt=chicken"
``` 