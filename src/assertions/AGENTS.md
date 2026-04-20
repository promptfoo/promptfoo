# Assertions

Assertion handlers turn provider outputs, traces, scripts, and model-graded checks into
Promptfoo pass/fail scores.

## Behavior Contracts

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

## Security And Side Effects

- JavaScript, Python, Ruby, webhook, and file/package assertion values can execute or
  load user-controlled code. Keep sandboxing, path resolution, and error messages
  explicit.
- Do not include raw secrets or full provider payloads in assertion reasons. Use the
  logger with sanitized object context for diagnostics.
- Redteam guardrail assertions have special aggregation behavior in
  `AssertionsResult`; do not change it without focused redteam tests.

## Public Documentation

Assertion behavior is user-facing. When adding an assertion type or changing accepted
values, scoring, thresholds, output shape, provider requirements, or examples, update
the matching docs under `site/docs/configuration/expected-outputs/`.

- Add or update the reference row in `site/docs/configuration/expected-outputs/index.md`.
- Deterministic assertions usually belong in
  `site/docs/configuration/expected-outputs/deterministic.md`.
- Model-graded assertions need
  `site/docs/configuration/expected-outputs/model-graded/index.md` plus a dedicated
  page in that directory when the behavior is substantial.
- Script/custom assertions should stay aligned with `javascript.md`, `python.md`, or
  `ruby.md`; provider-specific assertions may also need `moderation.md`, `similar.md`,
  `guardrails.md`, or a provider guide.
- If trace or trajectory behavior changes, update `site/docs/tracing.md` as well.

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
