---
title: GitHub Action
sidebar_label: GitHub Action
sidebar_position: 2
description: Automatically scan pull requests for LLM security vulnerabilities with the promptfoo Code Scan GitHub Action. Find prompt injection, PII exposure, and jailbreak risks in CI/CD.
---

# GitHub Action

Automatically scan pull requests for LLM security vulnerabilities with promptfoo's [code scanning GitHub action.](/code-scanning/github-action/)

The scanner analyzes code changes for prompt injection, PII exposure, excessive agency, and other LLM-specific risks. After scanning, findings are posted with severity levels and suggested fixes as PR review comments.

<img src="/img/docs/code-scanning/github.png" alt="Code Scan Action results on PR" style={{borderRadius: '8px', border: '1px solid rgba(0,0,0,0.1)', boxShadow: '0 2px 8px rgba(0,0,0,0.08)'}} />
<br/>
<br/>

## Quick Start

The easiest way to get started is by installing the Promptfoo Scanner GitHub App:

1. **Install the GitHub App**: Go to [github.com/apps/promptfoo-scanner](https://github.com/apps/promptfoo-scanner) and install the app
2. **Select repositories**: Choose which repositories to enable scanning for
3. **Submit your email or sign in**: You'll be redirected to promptfoo.dev to either submit your email or sign in to your account (an account is not required—just a valid email address)
4. **Review the setup PR**: A pull request will be automatically opened in each repository you selected in step 2—it adds the Code Scan Action workflow to `.github/workflows/promptfoo-code-scan.yml`
5. **Merge the PR**: you can tweak the workflow configuration if desired, and merge when ready.

Once merged, the scanner will automatically run on future pull requests, posting review comments for any security issues found.

:::info
When using the GitHub App:

- Authentication is handled automatically with GitHub OIDC. No API key, token, or other configuration is needed.
- No Promptfoo Cloud account is needed—just a valid email address.
  :::

## Configuration

### Action Inputs

Most CLI options from [`promptfoo code-scans run`](/docs/code-scanning/cli) can be used as action inputs:

| Input              | Description                                                      | Default                     |
| ------------------ | ---------------------------------------------------------------- | --------------------------- |
| `api-host`         | Promptfoo API host URL                                           | `https://api.promptfoo.dev` |
| `min-severity`     | Minimum severity to report (`low`, `medium`, `high`, `critical`) | `medium`                    |
| `minimum-severity` | Alias for `min-severity`                                         | `medium`                    |
| `config-path`      | Path to `.promptfoo-code-scan.yaml` config file                  | Auto-detected               |
| `guidance`         | Custom guidance to tailor the scan (see [CLI docs][1])           | None                        |
| `guidance-file`    | Path to file containing custom guidance (see [CLI docs][1])      | None                        |
| `enable-fork-prs`  | Enable scanning PRs from forked repositories                     | `false`                     |

[1]: [More on custom guidance](/docs/code-scanning/cli#custom-guidance)

### Triggering Additional Scans

If you made changes to your PR and want to run another scan, you can trigger a new scan by commenting on the PR with `@promptfoo-scanner`.

### Fork Pull Requests

By default, code scanning is disabled for fork PRs. This is because any GitHub user can open a fork PR on public repositories.

To trigger a scan on a fork PR, a maintainer with `write` permissions on the repository can comment on the PR with `@promptfoo-scanner`.

To enable scanning of fork PRs by default, add `enable-fork-prs: true` to your workflow file (`.github/workflows/promptfoo-code-scan.yml` in the main branch):

```yaml
- name: Run Promptfoo Code Scan
  uses: promptfoo/code-scan-action@v1
  with:
    enable-fork-prs: true
```

### Examples

**Scan with custom severity threshold:**

```yaml
- name: Run Promptfoo Code Scan
  uses: promptfoo/code-scan-action@v1
  with:
    min-severity: medium # Report medium, high and critical severity issues only (if omitted, all severity levels are reported)
```

**Use custom guidance:**

```yaml
- name: Run Promptfoo Code Scan
  uses: promptfoo/code-scan-action@v1
  with:
    guidance: |
      Focus on the document ingestion flow.
      Treat any potential PII exposure as critical severity.
```

**Load custom guidance from a file:**

```yaml
- name: Run Promptfoo Code Scan
  uses: promptfoo/code-scan-action@v1
  with:
    guidance-file: ./promptfoo-scan-guidance.md
```

**Use config file:**

```yaml
- name: Run Promptfoo Code Scan
  uses: promptfoo/code-scan-action@v1
  with:
    config-path: .promptfoo-code-scan.yaml
```

### Configuration File

Create a `.promptfoo-code-scan.yaml` in your repository root. See the [CLI documentation](/docs/code-scanning/cli#configuration-file) for all available options.

```yaml
# Minimum severity level to report
minSeverity: medium

# Scan only PR diffs without filesystem exploration (default: false)
diffsOnly: false

# Custom guidance to tailor the scan
guidance: |
  Focus on authentication and authorization vulnerabilities.
  Treat any PII exposure as high severity.
```

## Manual Installation

You can also install the action manually without the GitHub App. When using manual installation:

- Some features may not be available through the manual action installation, so the GitHub App is the recommended way to use the action
- PR comments appear to come from the generic `github-actions[bot]` instead of the official Promptfoo Scanner bot with the Promptfoo logo
- A Promptfoo Cloud account is required (rather than just a valid email address when using the GitHub App). You can [sign up or sign in here.](https://www.promptfoo.app/login)
- You'll need a [Promptfoo API token](https://www.promptfoo.app/api-tokens) for authentication

### Workflow Configuration

Add this workflow to your repository at `.github/workflows/promptfoo-code-scan.yml`:

```yaml
name: Promptfoo Code Scan

on:
  pull_request:
    types: [opened]

jobs:
  security-scan:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Promptfoo Code Scan
        uses: promptfoo/code-scan-action@v1
        env:
          PROMPTFOO_API_KEY: ${{ secrets.PROMPTFOO_API_KEY }}
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          min-severity: medium # or any other severity threshold: low, medium, high, critical
          # ... other configuration options...
```

## See Also

- [Code Scanning Overview](./index.md)
- [VS Code Extension](./vscode-extension.md)
- [CLI Command](./cli.md)
- [Promptfoo Scanner GitHub App](https://github.com/apps/promptfoo-scanner)
- [Promptfoo Code Scan Action on GitHub](https://github.com/promptfoo/code-scan-action)
