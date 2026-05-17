# Code Scan

Code scan scans pull requests for security issues using Git metadata, repository file
access through MCP, GitHub PR context, and the hosted scanner service.

## Rules

- Treat repository contents, branch names, PR metadata, config files, guidance text,
  and scanner responses as untrusted input.
- Pass command arguments as arrays to `spawn`, `execFile`, or the local git helpers.
  Do not build shell command strings from PR-controlled values.
- Keep filesystem MCP roots absolute and normalized. Do not widen the root beyond the
  repository being scanned, and always stop child processes on success, failure, or
  abort.
- Preserve npm/npx environment sanitization when spawning tool installers or MCP
  servers. When adding install paths, make the registry/cwd/env explicit and cover
  PR-controlled npm config in tests.
- Do not log or serialize raw API keys, OIDC tokens, GitHub tokens, cookies, or bearer
  headers. If auth context must cross a boundary, pass the minimum typed field needed.
- Prefer `git diff --raw -z`/NUL-safe parsing for file lists so paths with spaces,
  quotes, or shell metacharacters behave correctly.
- For GitHub review comments, map findings to changed diff lines before posting.
  Scanner findings outside the patch should not become invalid inline comments.
- Keep fork-PR behavior explicit. OIDC may be unavailable for forks; do not silently
  fall back to a more privileged credential path.
- Bound retries for server capacity and MCP timeouts. Do not add unbounded retry loops
  or hide cancellation.
- Propagate aborts to the scanner client and clean up socket listeners/timers.
- Preserve JSON output shape for `--json`; downstream action code parses it.

## Docs

Keep code scan behavior aligned with `site/docs/code-scanning/`; action-facing setup
changes also need `code-scan-action/README.md`.

## Validation

Run the focused tests for the area you changed:

```bash
npx vitest run test/codeScans
npx vitest run test/types/codeScan.test.ts
```

For action integration changes, also run `test/code-scan-action` from the repo root.
