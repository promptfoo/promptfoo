---
sidebar_position: 7
sidebar_label: Output Formats
---

# Output Formats

Save and analyze your evaluation results in various formats.

## Quick Start

```bash
# Interactive web viewer (default)
promptfoo eval

# Save as HTML report
promptfoo eval --output results.html

# Export as JSON for further processing
promptfoo eval --output results.json

# Create CSV for spreadsheet analysis
promptfoo eval --output results.csv
```

## Available Formats

### HTML Report

Generate a visual, shareable report:

```bash
promptfoo eval --output report.html
```

**Features:**

- Interactive table with sorting and filtering
- Side-by-side output comparison
- Pass/fail statistics
- Shareable standalone file

**Use when:** Presenting results to stakeholders or reviewing outputs visually.

### JSON Output

Export complete evaluation data:

```bash
promptfoo eval --output results.json
```

**Structure:**

```json
{
  "version": 3,
  "timestamp": "2024-01-15T10:30:00Z",
  "results": {
    "prompts": [...],
    "providers": [...],
    "outputs": [...],
    "stats": {...}
  }
}
```

**Use when:** Integrating with other tools or performing custom analysis.

### CSV Export

Create spreadsheet-compatible data:

```bash
promptfoo eval --output results.csv
```

**Columns include:**

- Test variables
- Prompt used
- Model outputs
- Pass/fail status
- Latency
- Token usage

**Use when:** Analyzing results in Excel, Google Sheets, or data science tools.

### YAML Format

Human-readable structured data:

```bash
promptfoo eval --output results.yaml
```

**Use when:** Reviewing results in a text editor or version control.

## Configuration Options

### Setting Output Path in Config

```yaml title="promptfooconfig.yaml"
# Specify default output file
outputPath: evaluations/latest_results.html

prompts:
  - '...'
tests:
  - '...'
```

### Multiple Output Formats

Generate multiple formats simultaneously:

```bash
# Command line
promptfoo eval --output results.html --output results.json

# Or use shell commands
promptfoo eval --output results.json && \
promptfoo eval --output results.csv
```

## Output Contents

### Standard Fields

All formats include:

| Field       | Description                  |
| ----------- | ---------------------------- |
| `timestamp` | When the evaluation ran      |
| `prompts`   | Prompts used in evaluation   |
| `providers` | LLM providers tested         |
| `tests`     | Test cases with variables    |
| `outputs`   | Raw LLM responses            |
| `results`   | Pass/fail for each assertion |
| `stats`     | Summary statistics           |

### Detailed Metrics

When available, outputs include:

- **Latency**: Response time in milliseconds
- **Token Usage**: Input/output token counts
- **Cost**: Estimated API costs
- **Error Details**: Failure reasons and stack traces

## Analyzing Results

### JSON Processing Example

```javascript
const fs = require('fs');

// Load results
const results = JSON.parse(fs.readFileSync('results.json', 'utf8'));

// Analyze pass rates by provider
const providerStats = {};
results.results.outputs.forEach((output) => {
  const provider = output.provider;
  if (!providerStats[provider]) {
    providerStats[provider] = { pass: 0, fail: 0 };
  }

  if (output.pass) {
    providerStats[provider].pass++;
  } else {
    providerStats[provider].fail++;
  }
});

console.log('Pass rates by provider:', providerStats);
```

### CSV Analysis with Pandas

```python
import pandas as pd

# Load results
df = pd.read_csv('results.csv')

# Group by provider and calculate metrics
summary = df.groupby('provider').agg({
    'pass': 'mean',
    'latency': 'mean',
    'cost': 'sum'
})

print(summary)
```

## Best Practices

### 1. Organize Output Files

```
project/
├── promptfooconfig.yaml
├── evaluations/
│   ├── 2024-01-15-baseline.html
│   ├── 2024-01-16-improved.html
│   └── comparison.json
```

### 2. Use Descriptive Filenames

```bash
# Include date and experiment name
promptfoo eval --output "results/$(date +%Y%m%d)-gpt4-temperature-test.html"
```

### 3. Version Control Considerations

```gitignore
# .gitignore
# Exclude large output files
evaluations/*.html
evaluations/*.json

# But keep summary reports
!evaluations/summary-*.csv
```

### 4. Automate Report Generation

```bash
#!/bin/bash
# run_evaluation.sh

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
promptfoo eval \
  --output "reports/${TIMESTAMP}-full.json" \
  --output "reports/${TIMESTAMP}-summary.html"
```

## Sharing Results

### Web Viewer

The default web viewer (`promptfoo view`) provides:

- Real-time updates during evaluation
- Interactive exploration
- Local-only (no data sent externally)

### Sharing HTML Reports

HTML outputs are self-contained:

```bash
# Generate report
promptfoo eval --output team-review.html

# Share via email, Slack, etc.
# No external dependencies required
```

### Promptfoo Share

For collaborative review:

```bash
# Share results with your team
promptfoo share
```

Creates a shareable link with:

- Read-only access
- Commenting capabilities
- No setup required for viewers

## Troubleshooting

### Large Output Files

For extensive evaluations:

```yaml
# Limit output size
outputPath: results.json
sharing:
  # Exclude raw outputs from file
  includeRawOutputs: false
```

### Encoding Issues

Ensure proper encoding for international content:

```bash
# Explicitly set encoding
LANG=en_US.UTF-8 promptfoo eval --output results.csv
```

### Performance Tips

1. **Use JSON for large datasets** - Most efficient format
2. **Generate HTML for presentations** - Best visual format
3. **Use CSV for data analysis** - Easy Excel/Sheets integration
4. **Stream outputs for huge evaluations** - Process results incrementally

## Related Documentation

- [Configuration Reference](/docs/configuration/reference) - All output options
- [Integrations](/docs/category/integrations/) - Using outputs with other tools
- [Command Line Guide](/docs/usage/command-line) - CLI options
