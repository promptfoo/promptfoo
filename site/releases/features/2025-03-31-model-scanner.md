---
slug: /features/model-scanner
title: Model scanner command - Automated security assessment
description: Learn how to use the model scanner command for automated AI model security assessment and vulnerability detection
authors: [promptfoo_team]
tags: [model-scanner, security, red-team, v0.107.0, march-2025]
keywords: [model scanner, security assessment, vulnerability detection, AI safety, automated testing]
date: 2025-03-31T23:59
---

# Model scanner command

The model scanner command provides automated security assessment for AI models, helping you identify vulnerabilities and security gaps in production AI systems.

**Introduced in**: v0.107.0 (March 2025)

## Overview

The model scanner runs systematic vulnerability assessments across multiple attack vectors and generates detailed security reports. It's designed to help security teams and developers identify potential weaknesses in AI models before they reach production.

## Basic usage

```bash
npx promptfoo@latest scan-model --provider openai:gpt-4 --output scan-report.json
```

## Command options

| Option | Description | Example |
|--------|-------------|---------|
| `--provider` | The model provider to scan | `openai:gpt-4` |
| `--output` | Output file for the scan report | `scan-report.json` |
| `--strategies` | Specific attack strategies to use | `audio,convert-to-image` |
| `--plugins` | Security plugins to include | `harmful,donotanswer` |
| `--timeout` | Timeout for each test (seconds) | `30` |

## Configuration examples

### Basic security scan

```bash
npx promptfoo@latest scan-model \
  --provider openai:gpt-4 \
  --output security-report.json \
  --strategies audio,convert-to-image,homoglyph \
  --plugins harmful,donotanswer
```

### Comprehensive assessment

```bash
npx promptfoo@latest scan-model \
  --provider anthropic:claude-3-sonnet \
  --output comprehensive-scan.json \
  --strategies all \
  --plugins all \
  --timeout 60
```

### Custom configuration file

Create a `scan-config.yaml` file:

```yaml
scan:
  provider: openai:gpt-4
  strategies:
    - audio
    - convert-to-image
    - homoglyph
  plugins:
    - harmful
    - donotanswer
    - xstest
  timeout: 45
  output: detailed-scan-report.json
```

Then run:

```bash
npx promptfoo@latest scan-model --config scan-config.yaml
```

## Understanding scan results

The scanner generates a comprehensive JSON report with the following structure:

```json
{
  "scanMetadata": {
    "provider": "openai:gpt-4",
    "timestamp": "2025-03-31T23:59:00Z",
    "strategies": ["audio", "convert-to-image"],
    "plugins": ["harmful", "donotanswer"]
  },
  "vulnerabilities": [
    {
      "type": "audio_attack",
      "severity": "high",
      "description": "Model vulnerable to audio-based attacks",
      "testCase": "audio_harmful_prompt_1",
      "response": "Model provided harmful content",
      "recommendation": "Implement audio input validation"
    }
  ],
  "summary": {
    "totalTests": 150,
    "vulnerabilitiesFound": 12,
    "highSeverity": 3,
    "mediumSeverity": 6,
    "lowSeverity": 3
  }
}
```

## Integration with CI/CD

### GitHub actions example

```yaml
name: Model Security Scan
on: [push, pull_request]

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Run Model Security Scan
        run: |
          npx promptfoo@latest scan-model \
            --provider openai:gpt-4 \
            --output scan-results.json \
            --strategies audio,convert-to-image
      
      - name: Upload Scan Results
        uses: actions/upload-artifact@v3
        with:
          name: security-scan-results
          path: scan-results.json
```

### Automated alerts

```bash
#!/bin/bash
# Check for high-severity vulnerabilities
npx promptfoo@latest scan-model --provider openai:gpt-4 --output scan.json

# Parse results and alert if high-severity issues found
HIGH_SEVERITY=$(jq '.summary.highSeverity' scan.json)
if [ "$HIGH_SEVERITY" -gt 0 ]; then
  echo "🚨 High-severity vulnerabilities detected: $HIGH_SEVERITY"
  exit 1
fi
```

## Best practices

### 1. Regular scanning
- Run scans before each model deployment
- Schedule automated scans in CI/CD pipelines
- Monitor for new vulnerability patterns

### 2. Comprehensive coverage
- Use multiple attack strategies
- Include various security plugins
- Test different input modalities (text, audio, images)

### 3. Result analysis
- Review all detected vulnerabilities
- Prioritize high-severity issues
- Document mitigation strategies

### 4. Continuous improvement
- Update scan configurations based on new threats
- Incorporate feedback from security teams
- Track vulnerability trends over time

## Troubleshooting

### Common issues

**Timeout errors**
```bash
# Increase timeout for complex models
npx promptfoo@latest scan-model --timeout 120
```

**Provider rate limits**
```bash
# Add delays between requests
npx promptfoo@latest scan-model --delay 1000
```

**Memory issues**
```bash
# Reduce concurrent tests
npx promptfoo@latest scan-model --concurrency 5
```

## Related features

- [Convert to image strategy](/releases/features/2025-03-31-convert-to-image) - Visual input security testing
- [Validation command](/releases/features/2025-05-31-validation-command) - Configuration validation

## Resources

- [Model scanner documentation](/docs/usage/command-line/#promptfoo-scan-model)
- [Security testing guide](/docs/red-team/)
- [GitHub repository](https://github.com/promptfoo/promptfoo)
- [Discord community](https://discord.gg/promptfoo)

---

**Back to**: [Release notes index](/releases/) 