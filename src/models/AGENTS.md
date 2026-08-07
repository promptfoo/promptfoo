# Eval Models

Eval and result persistence (`eval.ts`, `evalResult.ts`), count/cache helpers (`evalPerformance.ts`, `evalMutation.ts`), prompt/model-audit records, and DB-facing summary reconstruction.

## Rules

- Treat `Eval`, `EvalResult`, traces, signal files, and standalone/count caches as one lifecycle. Creating, mutating, rating, or deleting persisted eval data must invalidate the right caches and notify the view server via `evalMutation.ts`.
- Keep persisted JSON backward-compatible. Older eval rows can miss fields, contain malformed artifact JSON, or use legacy timestamp/string shapes; summary and table code should degrade rather than crash.
- Preserve secret handling on persistence boundaries. Provider configs, headers, test vars, prompts, and grader configs need the existing sanitizers/redaction paths before they land in DB rows or exported artifacts.
- Use Drizzle/sql template parameters for all user-controlled values. For dynamic JSON keys, prefer `json_each()` or `buildSafeJsonPath()`; see `docs/agents/database-security.md`.
- Keep batch/streaming paths memory-aware: large evals should use batched result fetches and optimized count helpers instead of loading every row just to count or page.

## Testing

- Model tests often require migrations first; use existing patterns in `test/models/*.test.ts`.
- Cover both in-memory and persisted evals when behavior differs.
- For delete/update paths, assert trace/span cleanup, cache invalidation, and signal-file notification behavior.

## Validation

```bash
npx vitest run test/models test/database
npm run local -- eval -c test/smoke/fixtures/configs/basic.yaml --no-cache -o output.json
```

Inspect exported JSON and any touched DB-backed summaries before claiming persistence behavior works.
