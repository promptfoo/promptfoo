# Tracing

OpenTelemetry setup, OTLP HTTP receiver, trace/span storage, trajectory extraction, local span export, and trace context passed into assertions.

## Rules

- Preserve trace linkage: eval ID, test case ID, trace ID, span ID, parent span ID, and `traceparent` propagation must stay consistent across evaluator, provider, store, and assertion paths.
- Store enough raw span data for assertions, but sanitize credential-like attributes on UI/export reads by default. Only use `sanitizeAttributes: false` for internal assertion workflows that explicitly need raw attributes.
- Keep OTLP ingestion tolerant and bounded. Accept supported JSON/protobuf shapes, drop malformed or unlinked records deliberately, and keep body/span limits in place.
- Normalize tool and command attributes through `toolAttributes.ts` / `traceContext.ts` so trajectory assertions keep working across provider telemetry conventions.
- Reset module-level tracing/receiver state in tests; avoid leaking receivers, OTEL providers, timers, or global mocks between test cases.

## Documentation

Tracing behavior is user-facing. When changing OTLP config, trace assertions, span filtering, trajectory normalization, or redaction, update `site/docs/tracing.md` and the relevant assertion docs under `site/docs/configuration/expected-outputs/`.

## Validation

```bash
npx vitest run test/tracing test/evaluator/trace-integration.test.ts test/assertions/trace.test.ts test/assertions/trajectory.test.ts
npm run tsc
```

For behavior changes, run a local eval with tracing enabled and inspect the stored/exported spans.
