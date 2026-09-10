# Evaluator runtime composition

The evaluator has three source entry points:

| Entry point                     | Responsibility                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `src/evaluator/engine.ts`       | Execute a resolved test suite using a required `EvaluatorRuntime`.             |
| `src/node/evaluateTestSuite.ts` | Supply the default Node runtime for the existing three-argument evaluator API. |
| `src/evaluator.ts`              | Preserve the established source exports and overloads.                         |

The public `promptfoo.evaluate()` API continues to resolve configuration through
Node composition and return an `Eval` record, including its summary and persistence
methods. These source boundaries do not introduce another npm package or a new
public subpath.

## Explicit runtimes

A supplied runtime owns store creation, result writers, and optional test-suite
resolution. When `resolveRuntimeTestSuite` is absent, the implementation uses the
supplied suite directly. It never borrows the Node runtime's environment renderer
or persistence adapter.

`EvaluationStore` remains the persistence interface. `InMemoryEvaluationStore`
implements the same result, resume, comparison, and writer-recovery operations for
caller-owned records. Evaluation returns the same record object supplied by the
caller. Resolving a runtime suite must preserve the caller's original configuration
for persistence; the Node resolver maintains its existing credential-reference
handling.

`EvalRunError` and `PromptSuggestionsRejectedError` live in
`src/evaluator/errors.ts`. Existing facade, evaluator, command, and Node error
exports reference these same classes so `instanceof` checks remain valid.

## CLI and library policy

Generated prompt variants require a runtime `selectPrompt` approval callback.
Without a selector, generation requests fail with `PromptSuggestionsRejectedError`
before contacting the suggestions provider. Only approved variants are added to the suite.
The optional `createProgressReporters` callback supplies at most one progress sink;
execution updates and closes it, while the runtime owns reporter selection.

Only CLI composition installs interactive prompt selection, terminal/CI reporters,
and the process exit status for rejected suggestions. Library, web, and MCP calls
retain progress callbacks without taking over the terminal or process exit policy.
An explicit runtime can reject all suggestions with
`PromptSuggestionsRejectedError`; the implementation never changes exit status.

## Scope of isolation

The implementation has no direct imports of database models or default Node
composition. The fresh-process regression rejects any import of the default Node
runtime and runs overlapping evaluations with independent stores and writers,
without migrations or database files.

This does not make the entire evaluator dependency graph portable. Dataset loading
still reaches `cli-progress` through the Hugging Face integration; removing the
engine's terminal adapter does not exclude that package from the dependency graph. Assertions,
provider registration, tracing (including local OTLP reception), cache context,
and product configuration still have their existing dependencies and lifecycle
behavior. Store isolation is a separate guarantee from provider-resource and
process-wide state isolation. Keep future lifecycle scopes around execution for
both explicit-runtime and default-runtime calls.

## Validation

```sh
npx vitest run test/evaluator/explicitRuntime.test.ts test/evaluator/runtime.test.ts
npx vitest run test/evaluator/errors.test.ts test/architecture/evaluatorStoreBoundary.test.ts
```

The standalone fixture uses deterministic inline providers, a fresh configuration
directory, and a memory cache. It checks overlapping runs, writer ownership,
resolver behavior, result identity, and setup-error identity outside the shared
evaluator test setup. Real CLI and built-library QA should additionally compare
exported outputs, scores, errors, and prompt IDs while preserving the public `Eval`
surface and caller process exit status.
