# Database Layer

SQLite/libSQL access (`index.ts`), schema (`tables.ts`), eval deletion (`evalDeletion.ts`), signal files (`signal.ts`), and test helpers (`testing.ts`).

## Rules

- **Never delete or reset the user's local DB or cache.** The dev DB is `~/.promptfoo/promptfoo.db`; use an isolated `PROMPTFOO_CONFIG_DIR` or the test helpers below for tests and repros.
- Treat eval rows, results, traces, spans, and signal files as one consistency boundary. When deleting or mutating eval data, trace every related table and file side effect (`evalDeletion.ts`).
- Keep writes idempotent: handle interrupted evals, partial results, malformed artifact rows, and reruns against existing output paths.
- Don't swallow persistence failures — surface the error or preserve enough in-memory state for finalization/recovery.
- Don't wrap provider calls, network, or filesystem work in long-lived transactions; libSQL opens fresh connections for top-level transactions.

## Test Isolation (libSQL gotchas)

Database tests use a **shared in-memory DB, never temp `.db` files.** When `IS_TESTING` is set, `index.ts` routes to `file::memory:?cache=shared` (connection-local `:memory:` won't share state across libSQL's fresh per-transaction connections). Isolation comes from a full schema reset, not a fresh file:

- Reset/teardown via `resetTestDatabaseClient` / `closeTestDatabaseClients` (`testing.ts`), already wired into `vitest.setup.ts`'s `afterAll`.
- **Do not** add per-test temp `.db` files — they broke Windows CI with `EBUSY: resource busy or locked, unlink`.
- **Do not** use named in-memory URLs like `file:<name>?mode=memory&cache=shared` — libSQL throws `URL_PARAM_NOT_SUPPORTED` (`?cache=shared` is only valid on exactly `:memory:`).
- When changing eval/result persistence, test both the persisted and the interrupted/recovery path; for concurrency-sensitive changes add a regression test that fails under overlapping reads/writes.

## Validation

```bash
npx vitest run test/database test/models test/server/routes
npm run local -- eval -c test/smoke/fixtures/configs/basic.yaml --no-cache -o output.json
```

Inspect the exported output and DB-backed behavior before claiming a change works.
