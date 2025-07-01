---
sidebar_position: 31
sidebar_label: Output Formats
title: Output Formats - Results Export and Analysis
description: Configure output formats for LLM evaluation results. Export to HTML, JSON, CSV, and YAML formats for analysis, reporting, and data processing.
keywords:
  [
    output formats,
    evaluation results,
    export options,
    HTML reports,
    JSON export,
    CSV analysis,
    result visualization,
  ]
pagination_prev: configuration/huggingface-datasets
pagination_next: configuration/chat
---

# Output formats

Save and analyze your evaluation results in various formats.

## Quick start

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

## Available formats

### Html report

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

### Json output

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

### Csv export

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

### Yaml format

Human-readable structured data:

```bash
promptfoo eval --output results.yaml
```

**Use when:** Reviewing results in a text editor or version control.

## Configuration options

### Setting output path in config

```yaml title="promptfooconfig.yaml"
# Specify default output file
outputPath: evaluations/latest_results.html

prompts:
  - '...'
tests:
  - '...'
```

### Multiple output formats

Generate multiple formats simultaneously:

```bash
# Command line
promptfoo eval --output results.html --output results.json

# Or use shell commands
promptfoo eval --output results.json && \
promptfoo eval --output results.csv
```

## Output contents

### Standard fields

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

### Detailed metrics

When available, outputs include:

- **Latency**: Response time in milliseconds
- **Token Usage**: Input/output token counts
- **Cost**: Estimated API costs
- **Error Details**: Failure reasons and stack traces

## Analyzing results

### Json processing example

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

### Csv analysis with pandas

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

## Best practices

### 1. organize output files

```
project/
├── promptfooconfig.yaml
├── evaluations/
│   ├── 2024-01-15-baseline.html
│   ├── 2024-01-16-improved.html
│   └── comparison.json
```

### 2. use descriptive filenames

```bash
# Include date and experiment name
promptfoo eval --output "results/$(date +%Y%m%d)-gpt4-temperature-test.html"
```

### 3. version control considerations

```gitignore
# .gitignore
# Exclude large output files
evaluations/*.html
evaluations/*.json

# But keep summary reports
!evaluations/summary-*.csv
```

### 4. automate report generation

```bash
#!/bin/bash
# run_evaluation.sh

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
promptfoo eval \
  --output "reports/${TIMESTAMP}-full.json" \
  --output "reports/${TIMESTAMP}-summary.html"
```

## Sharing results

### Web viewer

The default web viewer (`promptfoo view`) provides:

- Real-time updates during evaluation
- Interactive exploration
- Local-only (no data sent externally)

### Sharing HTML reports

HTML outputs are self-contained:

```bash
# Generate report
promptfoo eval --output team-review.html

# Share via email, Slack, etc.
# No external dependencies required
```

### Promptfoo share

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

### Large output files

For extensive evaluations:

```yaml
# Limit output size
outputPath: results.json
sharing:
  # Exclude raw outputs from file
  includeRawOutputs: false
```

### Encoding issues

Ensure proper encoding for international content:

```bash
# Explicitly set encoding
LANG=en_US.UTF-8 promptfoo eval --output results.csv
```

### Performance tips

1. **Use JSON for large datasets** - Most efficient format
2. **Generate HTML for presentations** - Best visual format
3. **Use CSV for data analysis** - Easy Excel/Sheets integration
4. **Stream outputs for huge evaluations** - Process results incrementally

## Related documentation

- [Configuration Reference](/docs/configuration/reference) - All output options
- [Integrations](/docs/category/integrations/) - Using outputs with other tools
- [Command Line Guide](/docs/usage/command-line) - CLI options
