# Database Layer

SQLite/libSQL access, migrations entrypoints, eval deletion, signal files, and database test helpers.

## Rules

- Do not delete or reset the user's local Promptfoo database or cache. Use isolated `PROMPTFOO_CONFIG_DIR` or test helpers for tests and reproduction.
- Treat eval rows, results, traces, spans, and signal files as a consistency boundary. When deleting or mutating eval data, trace all related tables and file side effects.
- Keep database writes idempotent where possible. Handle interrupted evals, partial results, malformed artifact rows, and reruns against existing output paths.
- Do not swallow persistence failures silently. Either surface the error clearly or preserve enough in-memory state for finalization/recovery.
- Avoid long-lived transactions around provider calls, network work, or filesystem operations.

## Tests and Fixtures

- Use in-memory or isolated temp database/config directories for tests.
- Close database handles and clean up temp directories.
- Add tests for both the persisted path and recovery path when changing eval/result persistence.
- For concurrency-sensitive changes, include a regression test that would fail under overlapping reads/writes or interrupted runs.

## Validation

Run focused database/model tests first, then a real eval if user-facing output or persistence changes:

```bash
npx vitest run test/database test/models test/server/routes
npm run local -- eval -c test/smoke/fixtures/configs/basic.yaml --no-cache -o output.json
```

Inspect the exported output and relevant DB-backed behavior before calling the workflow verified.
