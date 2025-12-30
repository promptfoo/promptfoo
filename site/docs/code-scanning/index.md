---
title: Code Scanning - LLM Security Vulnerability Scanner
description: Scan code changes for LLM security vulnerabilities using AI-powered analysis. Find prompt injection, PII exposure, and other security risks in pull requests.
keywords:
  [
    code security,
    LLM security,
    AI security,
    AI security scanning,
    security scanning,
    code scanning,
    prompt injection detection,
    PII detection,
    pull request review,
    PR review,
    security automation,
    GitHub Action security,
    vulnerability scanner,
  ]
sidebar_label: Overview
sidebar_position: 1
---

# Code Scanning

Promptfoo Code Scanning uses AI agents to find LLM-related vulnerabilities in your codebase and helps you fix them before you merge. By focusing specifically on LLM-related vulnerabilities, it finds issues that more general security scanners might miss.

## How It Works

The scanner examines code changes for common LLM security risks including prompt injection, PII exposure, and excessive agency. Rather than just analyzing the surface-level diff, it traces data flows deep into your codebase to understand how user inputs reach LLM prompts, how outputs are used, and what capabilities your LLM has access to.

This agentic approach catches subtle security issues that span multiple files, while maintaining a high signal-to-noise ratio to avoid alert fatigue.

## Getting Started

### GitHub Action

Automatically scan pull requests with findings posted as review comments. This is the recommended way to use the scanner if your code is on GitHub. [Set up the GitHub Action →](./github-action.md)

### VS Code Extension (Enterprise)

Scan code directly in your editor with real-time feedback, inline diagnostics, and quick fixes. Available for enterprise customers. [Learn more →](./vscode-extension.md)

### CLI Command

Run scans locally or in any CI environment. [Use the CLI →](./cli.md)

## Severity Levels

Findings are classified by severity to help you prioritize:

- **Critical** 🔴: Immediate security risk
- **High** 🟠: Significant issue
- **Medium** 🟡: Moderate risk
- **Low** 🔵: Minor issue

Configure minimum severity thresholds in your scan settings.

## Custom Guidance

Tailor scans to your needs by providing custom guidance:

- Focus on specific vulnerability types or code areas
- Adjust severity levels based on your context
- Suggest fixes using your preferred libraries
- Skip known false positives

**Example:**

```yaml
guidance: |
  Ignore the /examples directory—it contains demo code only.
  Treat potential PII exposure as critical.
  For this app, sending proprietary code to OpenAI or Claude is not a vulnerability.
  Use Zod schemas for validation when suggesting fixes.
```

## Cloud and Enterprise

Scans run on Promptfoo Cloud by default. For organizations that need to run scans on their own infrastructure, code scanning is available in [Promptfoo Enterprise On-Prem.](../enterprise)

## See Also

- [GitHub Action](./github-action.md)
- [VS Code Extension](./vscode-extension.md)
- [CLI Command](./cli.md)
- [Promptfoo Scanner GitHub App](https://github.com/apps/promptfoo-scanner)
