---
title: CLI Command
sidebar_label: CLI Command
sidebar_position: 3
description: Scan code changes for LLM security vulnerabilities using the promptfoo code-scans command.
---

# CLI Command

The `promptfoo code-scans` command scans code changes for LLM-related security vulnerabilities, helping you identify prompt injection risks, jailbreaks, PII exposure, and other security issues before they reach production.

## Quick Start

Install promptfoo globally:

```bash
npm install -g promptfoo
```

Authenticate with your promptfoo account:

```bash
promptfoo auth login
```

Run a scan on your current branch:

```bash
promptfoo code-scans run
```

## Running Time

Depending on the size of your PR and codebase, the scan can take anywhere from a minute or two to 20 minutes or more. That said, most PRs take between 3 and 10 minutes.

## Command Options

### Basic Usage

```bash
promptfoo code-scans run [repo-path] [options]
```

### Options

| Option                            | Description                                                                                         | Default                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `repo-path`                       | Path to repository                                                                                  | Current directory (`.`)                              |
| `--api-key <key>`                 | Promptfoo API key                                                                                   | From `promptfoo auth` or `PROMPTFOO_API_KEY` env var |
| `--base <ref>`                    | Base branch/commit to compare against                                                               | Auto-detects either main or master                   |
| `--compare <ref>`                 | Branch/commit to scan                                                                               | `HEAD`                                               |
| `--config <path>`                 | Path to config file                                                                                 | `.promptfoo-code-scan.yaml`                          |
| `--guidance <text>`               | Custom guidance to tailor the scan                                                                  | None                                                 |
| `--guidance-file <path>`          | Load guidance from a file                                                                           | None                                                 |
| `--api-host <url>`                | Promptfoo API host URL                                                                              | `https://api.promptfoo.app`                          |
| `--diffs-only`                    | Scan only PR diffs, don't explore full repo                                                         | false                                                |
| `--json`                          | Output results as JSON ([see schema](#json-output-schema))                                          | false                                                |
| `--github-pr <owner/repo#number>` | Post comments to GitHub PR (used with [Promptfoo GitHub Action](/docs/code-scanning/github-action)) | None                                                 |

### Examples

**Scan diffs for current branch, comparing against main (or master):**

```bash
promptfoo code-scans run
```

**Scan diffs for specific branch against main:**

```bash
promptfoo code-scans run --compare feature/new-llm-integration
```

**Scan diffs between two commits:**

```bash
promptfoo code-scans run --base ffa1b2d3 --compare a9c7e5b6
```

**Scan with custom config:**

```bash
promptfoo code-scans run --config custom-scan-config.yaml
```

**Get JSON output:**

```bash
promptfoo code-scans run --json
```

See [JSON Output Schema](#json-output-schema) for the response format.

## Configuration File

Create a `.promptfoo-code-scan.yaml` file in your repository root:

```yaml
# Minimum severity level to report (low|medium|high|critical)
# Both minSeverity and minimumSeverity are supported
minSeverity: medium

# Scan only PR diffs without filesystem exploration (default: false = explore full repo)
diffsOnly: false

# Optional: Custom guidance to tailor the scan to your needs
guidance: |
  Focus on authentication and authorization vulnerabilities.
  Treat any PII exposure as high severity.

# Or load guidance from a file (path relative to config file)
# guidanceFile: ./scan-guidance.md

# Optional: Promptfoo API host URL
# apiHost: https://api.promptfoo.dev
```

## Custom Guidance

You can provide custom guidance to tailor scans to your specific needs. See the [overview](./index.md#custom-guidance) for what guidance can do.

**Via command line:**

```bash
# Inline guidance
promptfoo code-scans run --guidance "Focus on authentication vulnerabilities in the /src/auth directory"

# Load from file
promptfoo code-scans run --guidance-file ./scan-guidance.md
```

**Via config file:**

```yaml
# Inline guidance
guidance: |
  Focus on authentication and authorization vulnerabilities.
  Treat any PII exposure as high severity.

# Or load from file
guidanceFile: ./scan-guidance.md
```

## Authentication

The code scanner supports multiple authentication methods (checked in order):

1. **CLI argument**: `--api-key <key>`
2. **Environment variable**: `PROMPTFOO_API_KEY=<key>`
3. **Promptfoo auth**: `promptfoo auth login`
4. **GitHub OIDC** (when used in the [Promptfoo GitHub Action](/docs/code-scanning/github-action)): Automatic

### Using promptfoo auth

```bash
# Login once
promptfoo auth login

# Then run scans without --api-key
promptfoo code-scans run
```

### Using environment variable

```bash
export PROMPTFOO_API_KEY=your-api-key
promptfoo code-scans run
```

### Using --api-key argument

```bash
promptfoo code-scans run --api-key your-api-key
```

## JSON Output Schema

When using `--json`, the scan outputs a JSON object to stdout with the following structure:

### Response Object

| Field            | Type        | Description                             |
| ---------------- | ----------- | --------------------------------------- |
| `success`        | `boolean`   | Whether the scan completed successfully |
| `review`         | `string`    | Overall review summary of the scan      |
| `comments`       | `Comment[]` | Array of findings (see below)           |
| `commentsPosted` | `boolean`   | Whether comments were posted to a PR    |
| `error`          | `string`    | Error message if the scan failed        |

### Comment Object

| Field           | Type     | Description                                    |
| --------------- | -------- | ---------------------------------------------- |
| `file`          | `string` | File path where the issue was found, or null   |
| `line`          | `number` | Line number of the finding, or null            |
| `startLine`     | `number` | Start line for multi-line findings, or null    |
| `finding`       | `string` | Description of the security issue              |
| `fix`           | `string` | Suggested fix for the issue                    |
| `severity`      | `string` | `critical`, `high`, `medium`, `low`, or `none` |
| `aiAgentPrompt` | `string` | Prompt for AI coding agents to fix the issue   |

### Example

```json
{
  "success": true,
  "review": "The PR introduces an LLM-powered support chat feature. The main security concerns are around prompt injection via user messages and insufficient output validation.",
  "comments": [
    {
      "file": "src/chat/handler.ts",
      "line": 42,
      "startLine": 40,
      "finding": "User input is passed directly to the LLM prompt without sanitization, allowing prompt injection attacks.",
      "fix": "Sanitize user input and use a system prompt that instructs the model to ignore injected instructions.",
      "severity": "critical",
      "aiAgentPrompt": "In src/chat/handler.ts around line 42, add input sanitization before passing user messages to the LLM. Use a system prompt with injection-resistant instructions."
    },
    {
      "file": "src/chat/handler.ts",
      "line": 87,
      "startLine": null,
      "finding": "LLM responses are rendered as raw HTML without escaping, which could allow cross-site scripting if the model is manipulated.",
      "fix": "Escape or sanitize LLM output before rendering it in the UI.",
      "severity": "high",
      "aiAgentPrompt": "In src/chat/handler.ts at line 87, escape the LLM response output before inserting it into the DOM to prevent XSS."
    }
  ]
}
```

## See Also

- [Code Scanning Overview](./index.md)
- [GitHub Action](./github-action.md)
- [VS Code Extension](./vscode-extension.md)
