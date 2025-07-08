# Output Handlers Example

This example demonstrates how to use custom output handlers to process evaluation results programmatically instead of just saving them to files.

## Features

Output handlers allow you to:

- Process evaluation results in real-time
- Send metrics to monitoring systems
- Trigger alerts based on success rates
- Export data to custom formats
- Integrate with existing workflows

## Usage

### JavaScript Handler

```bash
# Run evaluation with JavaScript handler
promptfoo eval --output file://output-handler.js

# Or use direct path (extension-based inference)
promptfoo eval --output ./output-handler.js
```

### Python Handler

```bash
# Run evaluation with Python handler
promptfoo eval --output file://output-handler.py

# Use a specific function
promptfoo eval --output file://output-handler.py:process_for_dashboard
```

### Configuration File

You can also specify output handlers in your `promptfooconfig.yaml`:

```yaml
outputPath:
  - file://output-handler.js
  - results.json # Can combine with regular file outputs
```

## Handler Interface

Handlers receive an object with the following structure:

```typescript
{
  evalId: string; // Unique evaluation ID
  results: EvaluateSummary; // Full evaluation results
  config: object; // Evaluation configuration
  shareableUrl: string | null; // URL if shared
}
```

The `results` object contains:

- `stats`: Overall statistics (successes, failures, token usage)
- `results`: Array of individual test results
- `table`: Formatted results table

## Examples in this Directory

- `output-handler.js`: JavaScript handler with monitoring integration examples
- `output-handler.py`: Python handler with CSV export and webhook examples
- `promptfooconfig.yaml`: Configuration using output handlers

## Running the Example

```bash
# Install dependencies
npm install

# Run with JavaScript handler
promptfoo eval

# Run with Python handler
promptfoo eval --output file://output-handler.py

# Run with custom function
promptfoo eval --output file://output-handler.py:process_for_dashboard
```

## Use Cases

1. **CI/CD Integration**: Fail builds when success rate drops below threshold
2. **Monitoring**: Send metrics to DataDog, Prometheus, etc.
3. **Alerting**: Trigger PagerDuty or Slack alerts on failures
4. **Custom Reporting**: Generate team-specific reports
5. **Data Pipeline**: Feed results into data warehouses
