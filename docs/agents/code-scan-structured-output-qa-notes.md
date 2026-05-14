# Code Scan Structured Output QA Notes

## Goal

Audit and harden the structured-output contract for `code-scans run` so JSON and
SARIF stdout stay parseable across:

- the shipped CLI entrypoint,
- the developer-facing `npm run local -- ...` path,
- verbose/debug logging modes,
- scanner success and failure cleanup paths,
- repeated or reordered output-format flags.

The review focus is not just "does the scanner restore a log level?" It is:
"can any ordinary or adversarial invocation append human-readable logs to stdout
that a downstream parser expects to be machine-readable?"

## Risk Model

Primary risks:

1. Startup logs fire before structured-output suppression is active.
2. Common CLI hooks re-enable debug logs after early suppression.
3. Scanner cleanup restores the prior log level too early.
4. Early scanner failures skip the restore path and poison later work in-process.
5. Argv detection disagrees with Commander for supported flag spellings or flag order.
6. The local TypeScript execution path drifts from the shipped entrypoint behavior.

## Matrix

### Static and unit coverage

- `requestsStructuredCodeScanOutput(...)`
  - JSON, SARIF, short/long format forms, combined `-f...`, repeated formats,
    value-eating flag arguments, and `--` separators.
- `executeScan(...)`
  - machine-readable no-files JSON and SARIF responses,
  - early config-load failure restoration,
  - cleanup-order restoration after a structured failure.
- common CLI pre-action
  - `--verbose` must not re-enable debug for structured code-scan requests.

### Runtime coverage

Use a temporary empty Git repository plus a local Socket.IO mock backend so the
scan reaches the real "no files to scan" structured-output path without hitting
the hosted service.

Exercise:

- built `dist/src/entrypoint.js`
  - JSON + `--verbose`
  - SARIF + `--verbose`
  - root-level `--verbose`
  - `--format text --json`
  - `LOG_LEVEL=debug`
- developer path (`npm run local -- ...`)
  - JSON + `--verbose`
  - SARIF + `--verbose`
  - `LOG_LEVEL=debug`
- text mode
  - verbose logs should remain visible

For structured cases, verify:

- exit code,
- stdout is parseable as JSON,
- stdout has no prefixed/suffixed log lines,
- stderr is empty unless the scenario intentionally tests a failure path.

## Findings So Far

### Confirmed clean

- Built entrypoint JSON/SARIF invocations with `--verbose` stayed parseable.
- Built entrypoint stayed parseable even when `LOG_LEVEL=debug` was present in
  the environment, because it suppresses structured code-scan logging before
  `main.ts` loads.
- Developer-path JSON/SARIF invocations with default logging stayed parseable.

### Reproduced leak

`npm run local -- code-scans run ... --json --verbose` still corrupts stdout when
`LOG_LEVEL=debug` is already set.

Observed stdout shape:

1. debug logs emitted during startup/module initialization,
2. database/proxy debug logs before the scanner payload,
3. the JSON payload,
4. shutdown debug logs after the payload.

That means the local TypeScript path does not match the shipped entrypoint's
structured-output guarantee under a legitimately noisy debug environment.

## Implemented Fix

Align `npm run local` with the shipped entrypoint by routing it through a
lightweight local wrapper that:

1. checks `requestsStructuredCodeScanOutput(process.argv.slice(2))`,
2. sets `LOG_LEVEL=error` before importing `main.ts`,
3. points `process.argv[1]` at `main.ts` so the existing main-module detection
   still executes the CLI normally.

After that:

- `package.json` now routes `npm run local` through `src/localEntrypoint.ts`.
- `test/smoke/cli.test.ts` now drives the built `entrypoint.js` against a local
  Socket.IO mock server and asserts JSON/SARIF stdout stay parseable under both
  `--verbose` and `LOG_LEVEL=debug`.

## Final Verification Results

### Runtime matrix

All of the following returned exit code `0`, emitted empty stderr, and produced
parseable machine-readable stdout:

- built entrypoint JSON + `--verbose`
- built entrypoint SARIF + `--verbose`
- built entrypoint root-level `--verbose` + JSON
- built entrypoint `--format text --json --verbose`
- built entrypoint JSON with `LOG_LEVEL=debug`
- built entrypoint SARIF with `LOG_LEVEL=debug`
- local wrapper JSON + `--verbose`
- local wrapper SARIF + `--verbose`
- local wrapper JSON with `LOG_LEVEL=debug`
- local wrapper SARIF with `LOG_LEVEL=debug`

Text mode was also exercised with `LOG_LEVEL=debug` on both the local wrapper and
the built entrypoint. Verbose human-readable logs remained visible, including the
scan banner, diff processing logs, `No files to scan`, and graceful shutdown logs.

### Automated regression coverage

- `test/main.test.ts`
- `test/codeScans/scanner-no-files.test.ts`
- `test/codeScans/util/structuredOutputDetect.test.ts`
- `test/smoke/cli.test.ts --config vitest.smoke.config.ts`

The smoke test is intentionally built-entrypoint focused: it protects the public
binary contract where parser breakage matters most, while the lower-level unit
tests cover scanner restore order, early-failure restoration, argv detection, and
the shared pre-action behavior.

### Build and residual check

- Production bundling completed with `tsdown`.
- `scripts/postbuild.ts` completed and refreshed distributable runtime assets.
- `tsc --noEmit` was attempted as an additional repo-wide check. In this worktree
  it still reports existing `TS2883` declaration portability errors in untouched
  mock/OpenAPI/server-route files, so it is not a discriminating signal for this
  code-scan change.
