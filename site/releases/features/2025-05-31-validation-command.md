---
slug: /features/validation-command
title: Validation command - Configuration quality assurance
description: Learn how to use the validation command to catch configuration issues before they cause problems
authors: [promptfoo_team]
tags: [validation-command, quality-assurance, developer-tools, v0.114.0, may-2025]
keywords: [validation command, configuration validation, quality assurance, developer tools]
date: 2025-05-31T23:59
---

# Validation command

The validation command provides configuration quality assurance by validating configurations before running evaluations, helping catch issues early and improve developer confidence.

**Introduced in**: v0.114.0 (May 2025)

## Overview

The validation command checks your promptfoo configuration files for common issues, syntax errors, and potential problems before you run evaluations. This helps prevent wasted time and resources by catching configuration issues early in the development process.

## Basic usage

```bash
npx promptfoo@latest validate
```

## Quick start

```bash
# Validate before running
npx promptfoo validate && npx promptfoo eval
```

## Command options

| Option | Description | Example |
|--------|-------------|---------|
| `--config` | Path to configuration file | `--config my-config.yaml` |
| `--strict` | Enable strict validation mode | `--strict` |
| `--output` | Output format for results | `--output json` |
| `--quiet` | Suppress non-error output | `--quiet` |

## Configuration validation

### Syntax validation
- **YAML syntax**: Validates proper YAML formatting
- **JSON syntax**: Checks JSON configuration files
- **JavaScript syntax**: Validates JavaScript prompt functions

### Structure validation
- **Required fields**: Ensures all required configuration fields are present
- **Field types**: Validates correct data types for configuration fields
- **Nested structures**: Checks nested configuration objects

### Content validation
- **Provider configuration**: Validates provider settings and API keys
- **Prompt templates**: Checks prompt syntax and variable usage
- **Test cases**: Validates test case structure and assertions

## Example usage

### Basic validation

```bash
# Validate default configuration
npx promptfoo@latest validate

# Validate specific configuration file
npx promptfoo@latest validate --config my-eval-config.yaml
```

### Strict validation

```bash
# Enable strict mode for comprehensive checking
npx promptfoo@latest validate --strict --config production-config.yaml
```

### Output formats

```bash
# JSON output for programmatic processing
npx promptfoo@latest validate --output json --config config.yaml

# Quiet mode for CI/CD integration
npx promptfoo@latest validate --quiet --config config.yaml
```

## Validation checks

### Configuration structure

```yaml
# Valid configuration structure
providers:
  - openai:gpt-4
    config:
      apiKey: ${OPENAI_API_KEY}

prompts:
  - "Analyze this text: {{input}}"

tests:
  - vars:
      input: "Sample text"
    assert:
      - type: contains
        value: "analysis"
```

### Common validation errors

```yaml
# ❌ Missing required field
providers:
  - openai:gpt-4
    # Missing config.apiKey

# ❌ Invalid provider name
providers:
  - invalid-provider:model

# ❌ Malformed test case
tests:
  - vars:
      input: "text"
    # Missing assert field
```

## Integration with development workflow

### Pre-commit hooks

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: promptfoo-validate
        name: Validate promptfoo config
        entry: npx promptfoo@latest validate
        language: system
        files: \.(yaml|yml|json)$
        pass_filenames: false
```

### CI/CD pipeline

```yaml
# .github/workflows/validate.yml
name: Validate Configuration
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Validate Configuration
        run: |
          npx promptfoo@latest validate --strict --config promptfooconfig.yaml
      
      - name: Validate All Configs
        run: |
          for config in configs/*.yaml; do
            echo "Validating $config"
            npx promptfoo@latest validate --config "$config"
          done
```

### IDE integration

```json
// .vscode/settings.json
{
  "promptfoo.validateOnSave": true,
  "promptfoo.validationLevel": "strict"
}
```

## Understanding validation results

### Success output

```bash
✅ Configuration validation passed
✅ All providers configured correctly
✅ All test cases are valid
✅ No syntax errors found
```

### Error output

```bash
❌ Configuration validation failed

Errors found:
1. Line 15: Missing required field 'apiKey' in provider config
2. Line 23: Invalid provider name 'invalid-provider'
3. Line 31: Test case missing required 'assert' field

Warnings:
1. Line 8: Consider using environment variables for API keys
2. Line 19: Provider 'openai:gpt-4' may be deprecated
```

### JSON output format

```json
{
  "valid": false,
  "errors": [
    {
      "line": 15,
      "column": 5,
      "message": "Missing required field 'apiKey'",
      "severity": "error"
    }
  ],
  "warnings": [
    {
      "line": 8,
      "column": 3,
      "message": "Consider using environment variables",
      "severity": "warning"
    }
  ],
  "summary": {
    "totalErrors": 3,
    "totalWarnings": 2,
    "validationTime": "0.5s"
  }
}
```

## Best practices

### 1. Validate early and often
- Run validation before every eval
- Include validation in CI/CD pipelines
- Use pre-commit hooks for automatic validation

### 2. Use strict mode in production
- Enable strict validation for production configs
- Treat warnings as errors in critical environments
- Validate all configuration files in your project

### 3. Custom validation rules
- Create custom validation scripts for project-specific rules
- Validate against your organization's security policies
- Check for compliance with internal standards

### 4. Continuous improvement
- Update validation rules based on common issues
- Document validation errors and solutions
- Share validation best practices with your team

## Troubleshooting

### Common validation issues

**Environment variable resolution**
```bash
# Ensure environment variables are set
export OPENAI_API_KEY="your-api-key"
npx promptfoo@latest validate
```

**File path issues**
```bash
# Use absolute paths if needed
npx promptfoo@latest validate --config /absolute/path/to/config.yaml
```

**Permission issues**
```bash
# Check file permissions
chmod 644 promptfooconfig.yaml
npx promptfoo@latest validate
```

## Related features

- [Target discovery agent](/releases/features/2025-05-31-target-discovery) - AI-powered vulnerability detection
- [xAI integration](/releases/features/2025-05-31-xai-integration) - Model context protocol support
- [Server-side pagination](/releases/features/server-pagination) - Performance improvements

## Resources

- [Validation command reference](/docs/usage/command-line/#promptfoo-validate)
- [Configuration guide](/docs/configuration/)
- [GitHub repository](https://github.com/promptfoo/promptfoo)
- [Discord community](https://discord.gg/promptfoo)

---

**Back to**: [Release notes index](/releases/) 