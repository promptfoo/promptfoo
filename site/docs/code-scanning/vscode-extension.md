---
title: VS Code Extension
sidebar_label: VS Code Extension
sidebar_position: 4
description: Detect LLM security vulnerabilities in VS Code with real-time scanning. Find prompt injection, jailbreak risks, and PII exposure as you code.
keywords:
  [
    vscode extension,
    VS Code security scanner,
    LLM security,
    prompt injection detection,
    code scanning IDE,
    real-time security scanning,
    enterprise,
  ]
---

# VS Code Extension

The Promptfoo Security Scanner for VS Code detects LLM security vulnerabilities directly in your editor. It finds prompt injection risks, jailbreak vulnerabilities, PII exposure, and other security issues as you code—before they reach your CI pipeline or production.

![VS Code extension showing inline security diagnostics](/img/docs/code-scanning/vscode-extension.png)

:::info Enterprise Feature
The VS Code extension is available for Promptfoo Enterprise customers. [Contact us](/contact) to get access for your organization.
:::

## Features

- **Real-time scanning**: Automatically scans files on save
- **Inline diagnostics**: Security issues appear as squiggly underlines in your code
- **Problems panel**: All findings listed in VS Code's Problems panel
- **CodeLens annotations**: Inline severity indicators above vulnerable code
- **Quick fixes**: Apply suggested fixes with one click
- **AI assistance**: Get AI-generated prompts to help fix complex issues
- **Git diff scanning**: Scan all changed files in your branch

## Getting Started

1. [Contact us](/contact) to get the extension package (`.vsix` file)
2. Install in VS Code: Extensions → ⋯ → Install from VSIX
3. Configure your API key: Cmd+Shift+P → **Promptfoo: Configure API Key**

## Usage

**Automatic scanning**: Files are scanned when you save. Findings appear as inline diagnostics in your code and in the Problems panel.

**Manual scanning**: Use the Command Palette (Cmd+Shift+P):

- **Promptfoo: Scan Current File** — Scan the active file
- **Promptfoo: Scan Selection** — Scan selected code
- **Promptfoo: Scan Git Changes** — Scan all changed files in your branch
- **Promptfoo: Clear All Scan Results** — Clear all diagnostics
- **Promptfoo: Show Output** — Show the extension's output channel

### Keyboard Shortcuts

| Shortcut                            | Command           |
| ----------------------------------- | ----------------- |
| Ctrl+Shift+P F (Mac: Cmd+Shift+P F) | Scan current file |

### Context Menu

Right-click in the editor to access:

- **Scan Current File** — Scan the entire file
- **Scan Selection** — Scan only the selected code (when text is selected)

## Configuration

Configure the extension in VS Code Settings or in your `settings.json`:

| Setting                          | Description                      | Default                     |
| -------------------------------- | -------------------------------- | --------------------------- |
| `promptfoo.apiHost`              | Promptfoo API host URL           | `https://api.promptfoo.app` |
| `promptfoo.minimumSeverity`      | Minimum severity to display      | `low`                       |
| `promptfoo.scanOnSave`           | Auto-scan files on save          | `true`                      |
| `promptfoo.scanOnSaveDebounceMs` | Debounce delay for auto-scan     | `1500`                      |
| `promptfoo.diffsOnly`            | Only analyze code diffs          | `true`                      |
| `promptfoo.showCodeLens`         | Show inline CodeLens annotations | `true`                      |
| `promptfoo.enabledLanguages`     | Languages to scan                | See below                   |

### Example settings.json

```json
{
  "promptfoo.minimumSeverity": "medium",
  "promptfoo.scanOnSave": true,
  "promptfoo.scanOnSaveDebounceMs": 2000,
  "promptfoo.showCodeLens": true
}
```

### Supported Languages

By default, the extension scans:

- JavaScript / TypeScript (including JSX/TSX)
- Python
- Go
- Java
- Rust
- Ruby
- PHP
- C#
- C/C++

Customize with the `promptfoo.enabledLanguages` setting. An empty array enables scanning for all languages.

## Severity Levels

Findings are classified by severity:

| Level    | Icon | Description                  |
| -------- | ---- | ---------------------------- |
| Critical | 🔴   | Immediate security risk      |
| High     | 🟠   | Significant vulnerability    |
| Medium   | 🟡   | Moderate concern             |
| Low      | 🔵   | Minor issue or best practice |

Use the `promptfoo.minimumSeverity` setting to filter out lower-severity findings.

## Privacy

Code is sent to Promptfoo's servers for analysis and is not stored after analysis completes. For organizations that need to run scans on their own infrastructure, the extension works with [Promptfoo Enterprise On-Prem](/docs/enterprise/).

## See Also

- [Code Scanning Overview](./index.md)
- [GitHub Action](./github-action.md)
- [CLI Command](./cli.md)
