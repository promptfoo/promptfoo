# Trajectory execution-status evaluation

## Goal

Make agent trajectory evaluation able to distinguish a tool that was invoked from a
tool invocation that completed successfully or failed. Promptfoo already preserves
`statusCode` and `statusMessage` on normalized trajectory steps, but deterministic
trajectory matchers do not expose that evidence to users.

## Incremental contribution story

The work is intentionally split into independently reviewable issues and PRs:

1. Add status matching to the shared trajectory matcher model and unit-test the
   matching semantics.
2. Add the public `trajectory:step-status` assertion, schema/docs, and a local CLI
   fixture that exercises successful and failed tool spans end to end.
3. Extend the recipe with composition cases covering retries and forbidden failed
   calls, only if the first two changes establish a stable API and maintainers want
   the follow-up.

Each issue will be filed before its corresponding PR and each PR will reference its
issue. No stage depends on an unreleased service or API key.

## Proposed user-facing API

```yaml
- type: trajectory:step-status
  value:
    name: delete_file
    status: error
```

The matcher supports a tool/command/span `name` or glob `pattern`, optional `type`,
and one status constraint. Status values are `success`, `error`, or a numeric status
code. An optional `message` pattern matches `statusMessage`. A missing status never
matches `success` or `error`; a numeric zero is treated as unset, consistent with the
existing trajectory model. `not-trajectory:step-status` uses the same matcher and
inverts only the actual match result.

## Implementation boundaries

- Reuse `TrajectoryStep.statusCode` and `statusMessage`; do not alter trace ingestion.
- Add a small status matcher type and pure helpers in `src/assertions/trajectoryUtils.ts`.
- Keep the assertion handler in `src/assertions/trajectory.ts` and register it in
  the assertion index and generated schema.
- Keep existing `trajectory:tool-used`, `trajectory:tool-args-match`, and
  `trajectory:tool-sequence` behavior unchanged.
- Add focused Vitest unit tests for the matcher and handler, including missing status,
  numeric codes, message patterns, inverse assertions, and multiple matching steps.
- Add a fixture/example using a deterministic local provider or trace fixture; the E2E
  test must run the built/local CLI with `--no-cache` and inspect the JSON result.
- Update deterministic assertion documentation with examples and failure reasons.

## Validation

For each implementation PR:

1. Write a failing unit test first and observe the expected failure.
2. Implement the smallest change and run the focused Vitest files.
3. Run type checking, lint/format checks, and relevant existing trajectory tests.
4. Run the local CLI fixture end to end and inspect pass/fail/error fields in its
   exported JSON.
5. Run the broader test suite proportionally to the touched boundaries before push.

## Risks and non-goals

This does not invent a provider-specific status vocabulary, inspect tool-result
payloads, or change OpenTelemetry span status ingestion. Numeric codes are compared
exactly; semantic success/error is deliberately limited to the conventional zero/non-
zero distinction until maintainers approve a broader policy.
