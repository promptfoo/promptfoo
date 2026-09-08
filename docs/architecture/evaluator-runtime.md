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

The optional runtime `selectPrompt` callback chooses generated prompt variants.
Without a selector, all requested variants are evaluated without terminal input.
The optional `createProgressReporters` callback supplies at most one progress sink; execution
updates and closes them, while the runtime owns reporter selection.

Only CLI composition installs interactive prompt selection, terminal/CI reporters,
and the process exit status for rejected suggestions. Library, web, and MCP calls
retain progress callbacks without taking over the terminal or process exit policy.
An explicit runtime can reject all suggestions with
`PromptSuggestionsRejectedError`; the implementation never changes exit status.

## Tracing lifecycle

When the suite, default-test or test metadata, or `PROMPTFOO_TRACING_ENABLED`
requests tracing, the engine requires the runtime's `createTracingLifecycle`
factory. It receives the resolved suite and evaluation ID and returns `start()`
and `close()` methods. An untraced evaluation never calls this factory. An explicit
runtime without a tracing adapter receives an error instead of selecting Node
services.

The engine closes result writers before the tracing lifecycle, including when
`start()` fails partway through. It then continues provider and scheduler cleanup.
A secondary cleanup failure is logged without replacing the original evaluation
error. Adapter implementations must release any resources acquired before a
failed start.

The default Node runtime supplies `src/node/tracingLifecycle.ts`. It keeps local
OTLP receiver acquisition, SDK ownership, flushing, the existing export grace
period, and receiver release together. SDK leases keep an evaluation-owned
provider alive until its final evaluation completes. Repeated evaluations can
register a fresh provider after shutdown. A host-initialized SDK remains owned by
the host; an externally registered SDK is borrowed without installing Promptfoo
exporters or shutdown handlers. The external host remains responsible for flushing
and shutting down its own SDK.

This port controls hosting and cleanup. Row-level span creation, trace-store
linkage, trace-aware assertion flushing, and local OTLP ingestion keep their
existing call positions and dependencies. It does not establish a database-free
or HTTP-free tracing profile.

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
