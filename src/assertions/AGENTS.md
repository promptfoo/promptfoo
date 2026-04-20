# Assertions

Assertion handlers turn provider outputs, traces, scripts, and model-graded checks into
Promptfoo pass/fail scores.

## Rules

- Preserve `GradingResult` shape, `pass`, `score`, `reason`, `tokensUsed`,
  `namedScores`, and `namedScoreWeights` semantics unless the PR intentionally updates
  every caller and test.
- Keep assertion wrappers in sync with `src/matchers/`. If a matcher signature or
  provider context changes, update the corresponding assertion handler and tests
  together.
- Do not mutate assertion/test objects unless existing UI or output behavior depends on
  it. If mutation is required, keep it narrow and covered by tests.
- Trace-aware assertions must tolerate missing, delayed, or partial trace data. Bound
  polling/retry behavior and keep failures explainable in the assertion reason.
- JavaScript, Python, Ruby, webhook, and file/package assertion values can execute or
  load user-controlled code. Keep sandboxing, path resolution, and error messages
  explicit.
- Do not include raw secrets or full provider payloads in assertion reasons. Use the
  logger with sanitized object context for diagnostics.
- Redteam guardrail assertions have special aggregation behavior in
  `AssertionsResult`; do not change it without focused redteam tests.

## Docs

Assertion behavior is user-facing. When adding or changing assertions, update
`site/docs/configuration/expected-outputs/` and its index. Trace or trajectory changes
also need `site/docs/tracing.md`.

## Testing

Run the assertion and matcher tests that cover the changed handler:

```bash
npx vitest run test/assertions/<assertion>.test.ts
npx vitest run test/matchers/<matcher>.test.ts
```

For shared aggregation, trace, or score changes, also run:

```bash
npx vitest run test/assertions/assertionsResult.test.ts test/assertions/runAssertions.test.ts
npx vitest run test/assertions/trace.test.ts test/evaluator/assertions.test.ts
```
