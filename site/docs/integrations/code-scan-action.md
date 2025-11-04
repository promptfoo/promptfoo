---
sidebar_label: Code Scan Action
description: Automatically scan pull requests for LLM security vulnerabilities with the promptfoo Code Scan GitHub Action. Find prompt injection, PII exposure, and jailbreak risks in CI/CD.
---

# Code Scan GitHub Action

Automatically scan pull requests for LLM security vulnerabilities using the [promptfoo Code Scan Action](https://github.com/promptfoo/code-scan-action).

The action runs on every pull request and posts detailed security findings with severity levels and suggested fixes directly as PR comments.

![Code Scan Action results on PR](/img/docs/code-scan-action-comment.png)

## Quick Start

Add this workflow to your repository at `.github/workflows/code-scan.yml`:

```yaml
name: 'Code Security Scan'

on:
  pull_request:
    branches: [main]

jobs:
  scan:
    runs-on: ubuntu-latest
    permissions:
      # Required to post comments on PRs
      pull-requests: write
      # Required for GitHub OIDC authentication
      id-token: write
      # Required to read repository contents
      contents: read

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          # Fetch full history for accurate diff
          fetch-depth: 0

      - name: Run Code Scan
        uses: promptfoo/code-scan-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

That's it! The action will now scan all pull requests and post findings as comments.

## Configuration

### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github-token` | GitHub token for posting comments | Yes | `${{ github.token }}` |
| `server-url` | Scan server URL | No | `https://api.promptfoo.dev` |
| `min-severity` | Minimum severity to report (`low`, `medium`, `high`, `critical`) | No | `high` |
| `minimum-severity` | Alias for `min-severity` | No | `high` |
| `fail-on-vulnerabilities` | Fail workflow if vulnerabilities found (`false`, `high`, `critical`) | No | `false` |
| `config-path` | Path to config file | No | Auto-generated |

:::tip
Both `min-severity` and `minimum-severity` are supported. Use whichever you prefer.
:::

### Examples

**Scan with custom severity threshold:**

```yaml
- name: Run Code Scan
  uses: promptfoo/code-scan-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    min-severity: medium  # Report medium and above
```

**Fail workflow on critical issues:**

```yaml
- name: Run Code Scan
  uses: promptfoo/code-scan-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    fail-on-vulnerabilities: critical  # Fail on critical findings
```

**Use custom config file:**

```yaml
- name: Run Code Scan
  uses: promptfoo/code-scan-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    config-path: .promptfoo-code-scan.yaml
```

## Configuration File

Create a `.promptfoo-code-scan.yaml` in your repository root:

```yaml
# Minimum severity level to report
minimumSeverity: high

# Enable filesystem access for broader codebase exploration
useFilesystem: true
```

## How It Works

1. **Triggers on PR**: Action runs when a pull request is opened or updated
2. **Fetches changes**: Compares PR branch against base branch
3. **Analyzes code**: AI-powered analysis identifies security issues
4. **Posts findings**: Comments are added to the PR with severity levels and fixes

### Sample PR Comment

```markdown
🔴 Critical: Prompt injection vulnerability
**File**: src/chat/handler.ts:45

User input directly concatenated into LLM prompt without sanitization.

<details>
<summary>💡 Suggested Fix</summary>

Use parameterized prompts or input validation to prevent injection attacks.
</details>
```

## Authentication

The action uses **GitHub OIDC** for authentication with the scan server. No API keys needed!

Required permissions:
```yaml
permissions:
  id-token: write      # For OIDC authentication
  pull-requests: write # To post comments
  contents: read       # To read code
```

## What Gets Scanned

The scanner analyzes:

- ✅ LLM prompts and templates
- ✅ API calls to LLM providers
- ✅ User input handling
- ✅ Output sanitization
- ✅ Sensitive data exposure
- ✅ Prompt injection vectors
- ✅ Jailbreak attempts

## Security Findings

### Severity Levels

- **Critical** 🔴: Immediate security risk, fix ASAP
- **High** 🟠: Significant issue, prioritize fixing
- **Medium** 🟡: Moderate risk, should be addressed
- **Low** 🔵: Minor issue or best practice

### Common Vulnerabilities Detected

1. **Prompt Injection**
   - Unsanitized user input in prompts
   - Insufficient input validation
   - Missing context isolation

2. **Data Exposure**
   - PII in logs or responses
   - Sensitive data in prompt history
   - Inadequate output filtering

3. **Jailbreak Risks**
   - Missing system message protection
   - Weak role enforcement
   - Insufficient output validation

4. **API Security**
   - Hardcoded API keys
   - Missing rate limiting
   - Insecure credential storage

## Advanced Usage

### Multiple Workflows

Run different severity levels for different branches:

```yaml
name: 'Code Scan - Strict'

on:
  pull_request:
    branches: [main, production]

jobs:
  scan:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: promptfoo/code-scan-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          min-severity: medium
          fail-on-vulnerabilities: high
```

### Conditional Execution

Only scan specific file types:

```yaml
on:
  pull_request:
    paths:
      - '**.ts'
      - '**.js'
      - '**.py'
      - '**.java'
```

### Matrix Strategy

Scan multiple configurations:

```yaml
jobs:
  scan:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        severity: [medium, high, critical]
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: promptfoo/code-scan-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          min-severity: ${{ matrix.severity }}
```

## Troubleshooting

### No comments posted

1. **Check permissions**: Ensure `pull-requests: write` is set
2. **Verify OIDC**: Ensure `id-token: write` permission exists
3. **Check fetch-depth**: Use `fetch-depth: 0` to get full git history

### Action fails with "Not a git repository"

Ensure you're using `actions/checkout@v4`:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
```

### Comments appear twice

The action and server both try to post comments as fallback. This is expected behavior when server posting fails.

### No files scanned

The scanner excludes:
- Dependencies (`node_modules/`, `.venv/`)
- Build artifacts (`dist/`, `build/`)
- Binary files
- Files > 500KB

Ensure your PR includes actual source code changes.

## Best Practices

1. **Use fetch-depth: 0**: Ensures accurate diffs
2. **Set min-severity**: Focus on actionable findings
3. **Use fail-on-vulnerabilities**: Enforce security standards
4. **Monitor action logs**: Check for authentication or scanning issues
5. **Regular updates**: Use `@v1` for automatic minor version updates

## Learn More

- [Code Scans CLI Guide](../guides/code-scans.md)
- [Red Team Testing](/docs/red-team/)
- [Security Best Practices](/docs/guides/llm-security-best-practices/)
- [GitHub Action Source](https://github.com/promptfoo/code-scan-action)
