# Promptfoo Code Scan GitHub Action

Automatically scan pull requests for LLM security vulnerabilities using AI-powered analysis.

## About Code Scanning

Promptfoo Code Scanning uses AI agents to find LLM-related vulnerabilities in your codebase and helps you fix them before you merge. By focusing specifically on LLM-related vulnerabilities, it finds issues that more general security scanners might miss.

The scanner examines code changes for common LLM security risks including prompt injection, PII exposure, and excessive agency. Rather than just analyzing the surface-level diff, it traces data flows deep into your codebase to understand how user inputs reach LLM prompts, how outputs are used, and what capabilities your LLM has access to.

After scanning, the action posts findings with severity levels and suggested fixes as PR review comments.

To also surface findings in GitHub Code Scanning, configure `sarif-output-path` and upload the generated file with `github/codeql-action/upload-sarif`.

### Scan scope

By default, the action scans the PR diff and traces into surrounding code paths so the scanner can follow data flow into prompts. Set `diffs-only: true` to restrict analysis to the changed hunks only.

### Config: action inputs vs `config-path`

There are two ways to configure a scan, and they don't mix:

- **Action inputs (default).** With `config-path` unset, the action builds a scan config from the inputs (`min-severity`, `diffs-only`, `guidance`, `guidance-file`). This is the path most workflows want.
- **YAML config file.** Set `config-path: configs/code-scan.yaml` to hand the CLI a checked-in policy file. When `config-path` is set, the YAML supplies every scan setting — the input-driven knobs above are dropped and a warning is emitted if any of them are also set, so the divergence is visible in the action logs.

`api-host` is the one input that's honored in both modes: an explicit `api-host` always overrides `apiHost` from `config-path`. Leave `api-host` unset to let the YAML choose an enterprise or self-hosted endpoint.

> **Security note for `pull_request` workflows.** Anything `config-path` points at in the PR checkout is editable by the PR author. Point `config-path` only at trusted workflow-controlled content (a path from the base branch, a file written by an earlier workflow step, etc.) — never at a policy file the PR itself can edit.

## Quick Start

**Recommended:** Install the [Promptfoo Scanner GitHub App](https://github.com/apps/promptfoo-scanner) for the easiest setup:

1. Go to [github.com/apps/promptfoo-scanner](https://github.com/apps/promptfoo-scanner) and install the app
2. Select which repositories to enable scanning for
3. Submit your email or sign in (no account required—just a valid email address)
4. Review and merge the setup PR that's automatically opened in your repository

Once merged, the scanner will automatically run on future pull requests. Authentication is handled automatically with GitHub OIDC—no API key needed.

**[Read the full documentation →](https://promptfoo.dev/docs/code-scanning/github-action)** for configuration options, manual installation, and more.

## Fork Pull Requests

Fork pull request scanning is disabled by default for `pull_request` workflows. A maintainer can trigger a fork PR scan through the Promptfoo Scanner comment flow, or you can opt in to scanning fork PRs automatically:

```yaml
- name: Run Promptfoo Code Scan
  id: promptfoo-code-scan
  uses: promptfoo/code-scan-action@v1
  with:
    enable-fork-prs: true
```

## SARIF Output

Grant `security-events: write` in the workflow job permissions, then upload the generated file.
The action sets `sarif-path` only when a scan actually completes, so keep the upload step conditional:

```yaml
- name: Run Promptfoo Code Scan
  id: promptfoo-code-scan
  uses: promptfoo/code-scan-action@v1
  with:
    sarif-output-path: promptfoo-code-scan.sarif

- name: Upload SARIF to GitHub Code Scanning
  if: ${{ steps.promptfoo-code-scan.outputs.sarif-path != '' }}
  uses: github/codeql-action/upload-sarif@v4
  with:
    sarif_file: ${{ steps.promptfoo-code-scan.outputs.sarif-path }}
    category: promptfoo-code-scan
```

## Contributing

Please note that this a release-only repository. To contribute, refer to the [associated directory](https://github.com/promptfoo/promptfoo/tree/main/promptfoo/code-scan-action) in the main promptfoo repository.

## License

MIT
