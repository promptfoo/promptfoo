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

# Output Formats

Save and analyze your evaluation results in various formats.

## Quick Start

```bash
# Run and save results locally
promptfoo eval

# Open the interactive web viewer
promptfoo view

# Save as HTML report
promptfoo eval --output results.html

# Export as JSON for further processing
promptfoo eval --output results.json

# Create CSV for spreadsheet analysis
promptfoo eval --output results.csv

# Generate JUnit XML for CI test-report integrations
promptfoo eval --output results.junit.xml
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

Export the eval configuration, summary statistics, and individual results:

```bash
promptfoo eval --output results.json
```

Individual results are in `results.results`. Each row includes `success`, `score`, the provider response, and grading details when available. See [Structured Output Fields](#structured-output-fields) for the field paths and [JSON Processing Example](#json-processing-example) for a working reader.

### CSV Export

Create spreadsheet-compatible data:

```bash
promptfoo eval --output results.csv
```

The CSV contains test-variable columns followed by a column group for each prompt/provider pair. Each group includes the output, `Status` (`PASS`, `FAIL`, or `ERROR`), `Score`, named scores, grading reason, and comments. These metadata headers repeat for each prompt/provider pair, so CSV readers may add suffixes to distinguish duplicate column names.

Use CSV to review the result table in a spreadsheet. Use JSON when you need structured responses, token usage, or latency fields.

### YAML Format

Human-readable structured data:

```bash
promptfoo eval --output results.yaml
```

**Use when:** Reviewing results in a text editor or version control.

### JSONL Format

Each line contains one JSON result:

```bash
promptfoo eval --output results.jsonl
```

**Use when:** Working with very large evaluations or when JSON export fails with memory errors.

```jsonl
{"testIdx":0,"promptIdx":0,"success":true,"score":1.0,"response":{"output":"Response 1"},"gradingResult":{"pass":true,"score":1.0,"reason":"All assertions passed","componentResults":[{"pass":true,"score":1.0,"reason":"Expected output to contain \"hello\"","assertion":{"type":"contains","value":"hello"}}]}}
{"testIdx":1,"promptIdx":0,"success":false,"score":0.0,"response":{"output":"Response 2"},"gradingResult":null}
```

For assertion-level details, inspect each row's `gradingResult?.componentResults` array when
present. The top-level `success`, `score`, and `gradingResult` fields describe the aggregate
result for the row, while each `componentResults[]` entry contains the pass/fail, score,
reason, and assertion metadata for one evaluated assertion. Both `gradingResult` and
`componentResults` may be absent on error rows or rows without assertions.

To stream a JSONL file and read each row's component results:

```ts
import fs from 'node:fs';
import readline from 'node:readline';

const rl = readline.createInterface({
  input: fs.createReadStream('results.jsonl', { encoding: 'utf8' }),
  crlfDelay: Infinity,
});

for await (const line of rl) {
  if (!line.trim()) {
    continue;
  }
  const row = JSON.parse(line);
  for (const component of row.gradingResult?.componentResults ?? []) {
    console.log({
      type: component.assertion?.type,
      pass: component.pass,
      score: component.score,
      reason: component.reason,
    });
  }
}
```

`?.` and `?? []` together cover the `gradingResult: null` case shown above and rows
where a single top-level assertion produced no nested `componentResults`.

### JUnit XML Format

Compact CI test-report output:

```bash
promptfoo eval --output results.junit.xml
```

**Structure:**

```xml
<testsuites tests="2" failures="1" errors="0" time="0.840">
  <testsuite name="[openai:gpt-4.1] prompt 1" tests="2" failures="1" errors="0" time="0.840">
    <testcase name="test 1: greets the customer" classname="[openai:gpt-4.1] prompt 1" time="0.420" />
    <testcase name="test 2: refuses refunds outside policy" classname="[openai:gpt-4.1] prompt 1" time="0.420">
      <failure message="Assertion failed">Score: 0
Reason: Assertion failed
Failed assertions:
- contains</failure>
    </testcase>
  </testsuite>
</testsuites>
```

**Use when:** Publishing eval results into CI systems that already understand JUnit-style test reports, such as GitLab, Azure Pipelines, Bitbucket Pipelines, Jenkins, and other test-report viewers.

JUnit XML intentionally stays compact:

- one `testsuite` per prompt/provider pair so CI groups related cases together
- one `testcase` per eval result so every promptfoo test appears in CI
- `failure` for failed assertions and `error` for provider/runtime errors so CI can distinguish incorrect behavior from execution problems
- concise failure/error summaries only; use JSON, HTML, or Promptfoo XML when you need assertion reasons, provider errors, prompts, variables, raw model outputs, or full config

A JUnit report viewer can render the same file into a compact pass/fail report:

![Rendered JUnit XML report showing one suite, two failures, and two passing tests](/img/docs/configuration/junit-xml-report.png)

### Promptfoo XML Full Export

Full eval data for XML-only consumers:

```bash
promptfoo eval --output results.xml
```

**Structure:**

```xml
<promptfoo>
  <evalId>abc-123-def</evalId>
  <results>
    <version>3</version>
    <timestamp>2024-01-15T10:30:00Z</timestamp>
    <prompts>...</prompts>
    <results>...</results>
    <stats>...</stats>
  </results>
  <config>...</config>
  <shareableUrl>...</shareableUrl>
</promptfoo>
```

**Use when:** A downstream system specifically requires the full Promptfoo export in XML. This is not a JUnit-compatible CI report format; use JUnit XML for CI dashboards and test-report viewers.

## Configuration Options

### Setting Output Path in Config

Set `outputPath` in your existing config. This fragment writes an HTML report after the eval:

```yaml
outputPath: evaluations/latest_results.html
```

### Multiple Output Formats

Repeat `--output` to export the same run in multiple formats:

```bash
promptfoo eval --output results.html --output results.json --output results.csv
```

Running `promptfoo eval` again starts another eval, which can produce different outputs.

## Output Contents

### Structured Output Fields

JSON, YAML, and Promptfoo XML share an export envelope with these field paths:

| Field               | Description                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `evalId`            | Saved eval identifier                                                                                     |
| `results.version`   | Result schema version                                                                                     |
| `results.timestamp` | Eval timestamp                                                                                            |
| `results.prompts`   | Prompt/provider combinations                                                                              |
| `results.results`   | Individual results, including `testCase`, `provider`, `response`, `success`, `score`, and `gradingResult` |
| `results.stats`     | Counts of successes, assertion failures, and errors, plus usage statistics                                |
| `config`            | Eval configuration                                                                                        |
| `shareableUrl`      | Shared result URL, or `null` when unavailable                                                             |

In each result, `failureReason` distinguishes success (`0`), an assertion failure (`1`), and an execution error (`2`). An `error` message can appear for either kind of failure, so its presence alone does not identify an execution error. Optional data such as traces and export metadata may also be present.

:::warning

`json`, `yaml`, `yml`, `txt`, `html`, and Promptfoo XML outputs include the eval `config`. Sensitive fields are redacted using Promptfoo's sanitizer rules on a best-effort basis (not comprehensive). Non-sensitive `config.env` values may still appear in exports.

JUnit XML omits the eval config, prompts, variables, raw model outputs, assertion reasons, and provider error payloads by design so CI test-report viewers stay compact and do not become a second full export surface.

:::

### Detailed Metrics

When available, outputs include:

- **Latency**: Response time in milliseconds
- **Token Usage**: Input/output token counts
- **Cost**: Estimated API costs
- **Error Details**: Failure reasons and stack traces

## Analyzing Results

### JSON Processing Example

Count results by provider while keeping assertion failures separate from execution errors:

<!-- prettier-ignore -->
```javascript
const fs = require('node:fs')
const output = JSON.parse(fs.readFileSync('results.json', 'utf8'))
const providers = new Map()

for (const result of output.results.results) {
  const id = result.provider.label || result.provider.id
  const counts = providers.get(id) || { passed: 0, failed: 0, errors: 0 }
  if (result.success) {
    counts.passed++
  } else if (result.failureReason === 2) {
    counts.errors++
  } else {
    counts.failed++
  }
  providers.set(id, counts)
}

console.table(Object.fromEntries(providers))
```

### CSV Analysis with Pandas

For a CSV with one prompt/provider pair, count the result statuses:

```python
import pandas as pd

df = pd.read_csv('results.csv')
print(df['Status'].value_counts())
```

For multiple prompt/provider pairs, inspect `df.columns` and select the corresponding status column.

## Best Practices

### 1. Organize Output Files

```text
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

Run `promptfoo view` to inspect locally saved evals in your browser. Sharing or uploading results is a separate action or account setting. See [sharing results](/docs/usage/sharing) before distributing an eval.

### Sharing HTML Reports

HTML outputs are self-contained:

```bash
# Generate report
promptfoo eval --output team-review.html

# Share via email, Slack, etc.
# No external dependencies required
```

### Promptfoo Share

Run `promptfoo share` to upload a saved eval and get a link for collaborators. Review the [sharing configuration and access rules](/docs/usage/sharing) before uploading sensitive data.

## Troubleshooting

### Large Output Files

If JSON export fails with a string-length or memory error, use JSONL to write individual result rows:

```bash
promptfoo eval --output results.jsonl
```

This command starts another eval. To export an existing saved run, use [`promptfoo export eval <evalId>`](/docs/usage/command-line#promptfoo-export).

### Encoding Issues

Exports use UTF-8. If a spreadsheet shows garbled characters, import the CSV explicitly as UTF-8 rather than changing the eval's locale.

### Performance Tips

Choose only the formats you need. JSONL supports processing one result at a time, while JSON includes the configuration and summary in one document. HTML is useful for visual review, and CSV for spreadsheet work.

## Related Documentation

- [Configuration Reference](/docs/configuration/reference) - All output options
- [Integrations](/docs/category/integrations/) - Using outputs with other tools
- [Command Line Guide](/docs/usage/command-line) - CLI options
