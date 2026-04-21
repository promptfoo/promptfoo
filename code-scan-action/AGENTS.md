# Code Scan GitHub Action

This package contains the GitHub Action wrapper for Promptfoo code scan.

## Rules

- Treat GitHub event fields, changed paths, `guidance`, and `guidance-file` contents as
  untrusted. Pass PR-controlled values through `@actions/exec` argument arrays, not
  shell interpolation.
- Keep `github-token` out of package installs, scanner subprocesses, and PR-controlled
  code. Preserve sanitized npm env handling, and keep fork-PR/OIDC fallback explicit.
- Keep `action.yml`, `src/main.ts`, tests, `site/docs/code-scanning/github-action.md`,
  and `code-scan-action/README.md` aligned when inputs or setup behavior change.
- This directory has its own package and lockfile. Update them only for action
  dependency changes, and add `dist/` only when packaging an action release.

## Validation

From the repo root:

```bash
npx vitest run test/code-scan-action
npm --prefix code-scan-action run tsc
npm --prefix code-scan-action run build
```
