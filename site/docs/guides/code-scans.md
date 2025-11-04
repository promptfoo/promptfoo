---
sidebar_label: Code Security Scans
description: Scan code changes for LLM security vulnerabilities using promptfoo code-scans command.
---

# Code Security Scanning

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

## How It Works

The code scanner:

1. **Compares your branch** against the base branch (usually `main`)
2. **Analyzes changed files** using AI security analysis
3. **Reports vulnerabilities** with severity levels and suggested fixes
4. **Posts comments** to your PR (when using `--github-pr` flag)

## Command Options

### Basic Usage

```bash
promptfoo code-scans run [repo-path] [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `repo-path` | Path to repository | Current directory (`.`) |
| `--api-key <key>` | Promptfoo API key | From `promptfoo auth` or `PROMPTFOO_API_KEY` env var |
| `--base <ref>` | Base branch/commit to compare against | Auto-detected from git |
| `--compare <ref>` | Branch/commit to scan | `HEAD` |
| `--config <path>` | Path to config file | `.promptfoo-code-scan.yaml` |
| `--server-url <url>` | Scan server URL | `https://api.promptfoo.dev` |
| `--use-filesystem` | Enable broader codebase exploration | false |
| `--json` | Output results as JSON | false |
| `--github-pr <owner/repo#number>` | Post comments to GitHub PR | None |

### Examples

**Scan current branch:**

```bash
promptfoo code-scans run
```

**Scan specific branch against main:**

```bash
promptfoo code-scans run --base main --compare feature/new-llm-integration
```

**Scan with custom config:**

```bash
promptfoo code-scans run --config custom-scan-config.yaml
```

**Scan and post to GitHub PR:**

```bash
promptfoo code-scans run --github-pr promptfoo/promptfoo#123
```

**Get JSON output:**

```bash
promptfoo code-scans run --json > scan-results.json
```

## Configuration File

Create a `.promptfoo-code-scan.yaml` file in your repository root:

```yaml
# Minimum severity level to report (low|medium|high|critical)
# Both minSeverity and minimumSeverity are supported
minSeverity: high

# Enable filesystem MCP server for broader codebase exploration
useFilesystem: true

# Optional: API key (alternative to promptfoo auth login)
# apiKey: your-api-key-here

# Optional: Custom server URL
# serverUrl: https://api.promptfoo.dev
```

## Authentication

The code scanner supports multiple authentication methods (checked in order):

1. **CLI argument**: `--api-key <key>`
2. **Environment variable**: `PROMPTFOO_API_KEY=<key>`
3. **Promptfoo auth**: `promptfoo auth login`
4. **GitHub OIDC** (in GitHub Actions): Automatic

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

## What Gets Scanned

The scanner analyzes:

- ✅ **LLM prompts and templates**
- ✅ **API calls to LLM providers**
- ✅ **User input handling**
- ✅ **Output sanitization**
- ✅ **Sensitive data exposure**
- ✅ **Prompt injection vectors**
- ✅ **Jailbreak attempts**

File types scanned include: `.ts`, `.js`, `.py`, `.java`, `.go`, `.rb`, `.php`, and more.

Files automatically excluded:
- Dependencies (`node_modules/`, `.venv/`, etc.)
- Build artifacts (`dist/`, `build/`, etc.)
- Lock files
- Binary files
- Files larger than 500KB

## Understanding Results

### Severity Levels

- **Critical** 🔴: Immediate security risk requiring urgent attention
- **High** 🟠: Significant security issue that should be fixed soon
- **Medium** 🟡: Moderate risk that should be addressed
- **Low** 🔵: Minor issue or best practice recommendation

### Sample Output

```
📊 SCAN RESULTS

🔴 Critical: Prompt injection vulnerability in user input handler
   File: src/chat/handler.ts:45
   Finding: User input directly concatenated into LLM prompt without sanitization
   Fix: Use parameterized prompts or input validation

🟠 High: PII exposure risk in logging
   File: src/logging/logger.ts:23
   Finding: Full conversation history logged without PII redaction
   Fix: Implement PII detection and redaction before logging

Minimum severity threshold for this scan: High
```

## CI/CD Integration

See the [Code Scan GitHub Action](./code-scan-action.md) guide for automated scanning in pull requests.

## Troubleshooting

### "No changed files found"

Make sure you're on a branch with changes:

```bash
git status
git diff main...HEAD
```

### "Authentication failed"

Check your authentication:

```bash
# Verify you're logged in
promptfoo auth status

# Or set API key
export PROMPTFOO_API_KEY=your-key
```

### "All files filtered by denylist"

The scanner excludes dependencies and build artifacts. Make sure your changes include actual source code files.

## Learn More

- [GitHub Action Integration](./code-scan-action.md)
- [Red Team Testing](/docs/red-team/)
- [Security Best Practices](/docs/guides/llm-security-best-practices/)
