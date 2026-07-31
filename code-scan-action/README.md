# Promptfoo Code Scan GitHub Action

Automatically scan pull requests for LLM security vulnerabilities using AI-powered analysis.

## About Code Scanning

Promptfoo Code Scanning uses AI agents to find LLM-related vulnerabilities in your codebase and helps you fix them before you merge. By focusing specifically on LLM-related vulnerabilities, it finds issues that more general security scanners might miss.

The scanner examines code changes for common LLM security risks including prompt injection, PII exposure, and excessive agency. Rather than just analyzing the surface-level diff, it traces data flows deep into your codebase to understand how user inputs reach LLM prompts, how outputs are used, and what capabilities your LLM has access to.

After scanning, the action posts findings with severity levels and suggested fixes as PR review comments.

To also surface findings in GitHub Code Scanning, configure `sarif-output-path` and upload the generated file with `github/codeql-action/upload-sarif`.

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
  uses: promptfoo/code-scan-action@v0
  with:
    enable-fork-prs: true
```

## SARIF Output

Grant `security-events: write` in the workflow job permissions, then upload the generated file.
The action sets `sarif-path` only when a scan actually completes, so keep the upload step conditional:

```yaml
- name: Run Promptfoo Code Scan
  id: promptfoo-code-scan
  uses: promptfoo/code-scan-action@v0
  with:
    sarif-output-path: promptfoo-code-scan.sarif

- name: Upload SARIF to GitHub Code Scanning
  if: ${{ steps.promptfoo-code-scan.outputs.sarif-path != '' }}
  uses: github/codeql-action/upload-sarif@54f647b7e1bb85c95cddabcd46b0c578ec92bc1a # v4.36.3
  with:
    sarif_file: ${{ steps.promptfoo-code-scan.outputs.sarif-path }}
    category: promptfoo-code-scan
```

## Supply Chain Security

The hardening below applies to releases after v0.1.8; earlier releases resolve `promptfoo@latest` at runtime and predate the provenance attestation.

- **Pinned scanner install.** The action installs an exact, release-pinned version of the `promptfoo` CLI with npm lifecycle scripts disabled (`--ignore-scripts`); it does not resolve `promptfoo@latest` at runtime. Use the `promptfoo-version` input (exact versions only) to override the pin.
- **Pin by commit SHA for maximum assurance.** Version tags like `v0` and `v0.1.8` are managed by release automation and, like all git tags, are not cryptographically immutable — only a full commit SHA is. Resolve a release tag to its commit and pin that:

  ```bash
  gh api repos/promptfoo/code-scan-action/commits/<tag> --jq .sha
  ```

  ```yaml
  uses: promptfoo/code-scan-action@<full-commit-sha> # <tag>
  ```

- **Verify build provenance.** The committed `dist/` bundle and the `action.yml` that selects the entrypoint are built and exported by the [promptfoo monorepo release workflow](https://github.com/promptfoo/promptfoo/blob/main/.github/workflows/release-please.yml), which publishes a signed build-provenance attestation for the exact artifact bytes. Verify a checkout of this repository with:

  ```bash
  gh attestation verify dist/index.js --repo promptfoo/promptfoo --signer-workflow promptfoo/promptfoo/.github/workflows/release-please.yml --source-ref refs/heads/main
  gh attestation verify action.yml --repo promptfoo/promptfoo --signer-workflow promptfoo/promptfoo/.github/workflows/release-please.yml --source-ref refs/heads/main
  ```

  Additionally, every release PR in this repository is validated by a workflow that rebuilds `dist/` from the pinned monorepo source commit and fails on any byte difference.

- **Don't run untrusted PR code before the scan in the same job.** The scanner install strips npm config and `NODE_OPTIONS` from its environment and isolates its npm config files, but a step that executes pull-request-controlled code earlier in the same job (for example `npm ci` or a build) can persist state — `$GITHUB_PATH`, `$GITHUB_ENV`, or `$HOME` writes — that later steps inherit, and such a step already runs with the job's token. Keep the scan in a job that only checks out the PR and scans it, or run untrusted build steps in a separate job.

## Contributing

Please note that this is a release-only repository. To contribute, refer to the [associated directory](https://github.com/promptfoo/promptfoo/tree/main/code-scan-action) in the main promptfoo repository.

## License

MIT
