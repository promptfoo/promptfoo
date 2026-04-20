# Code Scan GitHub Action

This package contains the GitHub Action wrapper for Promptfoo code scan.

## Action Security

- Treat all GitHub event fields, branch names, PR titles, labels, changed paths,
  `guidance`, and `guidance-file` contents as untrusted.
- Do not interpolate PR-controlled values into shell commands. Use `@actions/exec`
  with argument arrays and typed inputs.
- Keep `github-token` scoped to GitHub API operations. Do not expose it to package
  installs, scanner subprocesses, or PR-controlled code.
- Preserve the sanitized npm environment used when installing/running `promptfoo`.
  If adding new install or `npx` paths, strip PR-controlled npm lifecycle/config env
  before credentials exist in that process.
- OIDC is unavailable on some fork PR flows. Keep fork-PR fallback explicit and avoid
  silently upgrading fork scans to a privileged token path.

## Inputs And Outputs

- Keep `action.yml`, `src/main.ts`, and tests in sync whenever adding or renaming an
  input.
- Validate mutually exclusive inputs (`guidance` vs `guidance-file`) before running
  the scanner.
- Scanner output consumed by this action must remain valid JSON when `--json` is set.
  Do not mix human logs into stdout that is parsed as JSON.

## Package Boundaries

- This directory has its own `package.json` and lockfile. Update its lockfile only for
  action dependency changes.
- For ordinary source/test edits, do not add generated `dist/` output unless the
  change is explicitly packaging an action release.

## Validation

From the repo root:

```bash
npx vitest run test/code-scan-action
npm --prefix code-scan-action run tsc
npm --prefix code-scan-action run build
```
