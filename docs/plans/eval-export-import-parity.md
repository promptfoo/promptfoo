# Eval Export And Import Parity

## Goal

`promptfoo export eval` should create an eval artifact that `promptfoo import` can
restore with high fidelity while preserving the existing import formats and the
local data-security boundaries. The parity contract is for portable eval state,
not for cloning every row in a Promptfoo data directory.

## Data Scope

| Surface                 | Export/import expectation                                                                               | Notes                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Eval identity           | Preserve ID by default, preserve timestamp and author, allow `--new-id` and `--force`                   | Existing v2 and v3 imports remain accepted.                                                                       |
| Config                  | Export and import the sanitized config                                                                  | Config export already redacts secret-like values. Import must not recover redacted secrets.                       |
| Results                 | Preserve prompts, result rows, stats, responses, grading, vars on result rows, and explicit eval vars   | Current exports include explicit eval vars so unused vars do not disappear on import.                             |
| Runtime metadata        | Preserve runtime options and persisted durations where present                                          | Older exports omit these fields and still import with legacy defaults.                                            |
| Traces                  | Export sanitized traces and restore them under the imported eval ID                                     | Trace reads redact sensitive attribute keys. `--new-id` must remap globally unique trace IDs.                     |
| Blob media              | Export referenced blob bytes only with explicit `--include-media` and restore them before result import | Blob URIs alone are not portable across data directories. Embedded assets are content-addressed and size-bounded. |
| Share/cache/local joins | Do not reconstruct share URLs, cache entries, tags, dataset links, or unrelated local database state    | These are local or external relationships, not self-contained eval payload.                                       |

## Gap Analysis

### Recovered

- Persisted eval vars, including vars that do not appear in an imported result row.
- Persisted runtime options and eval duration stats.
- Trace records and spans for current exports.
- Blob assets that are referenced by results when the export is made with
  `--include-media`.

### Intentionally Not Recovered

- Redacted config secrets.
- Blobs omitted from a default export, blobs missing from the exporting blob
  provider, and arbitrary blob assets not referenced by exported results.
- Tags, dataset links, prompt-cache entries, share state, logs, and other local
  rows that are not eval payload.

## Security Model

- Treat an imported export file as untrusted input.
- Keep config export on the existing sanitizer path for stdout and file exports.
- Read traces through the trace store so exported attribute values use the
  existing redaction and truncation path.
- Keep blob bytes opt-in on export. Referenced media can be large and can carry
  sensitive user content.
- Validate embedded blob payload size and content-addressed hash before import.
  Store bytes through the existing blob provider so filesystem path validation,
  deduplication, and database bookkeeping stay centralized.
- Import blobs before result rows. The existing result extractor then records
  references only for bytes present in the target blob provider.

## QA Steps

1. Run focused unit tests after each parity slice:

   ```sh
   npx vitest run test/commands/import.test.ts test/commands/export.test.ts test/util/jsonExport.test.ts test/util/output.test.ts test/tracing/store.test.ts
   ```

2. Verify a current trace export round trip in isolated data directories:

   ```sh
   npm run local -- export eval <trace-eval-id> -o /tmp/trace-export.json
   PROMPTFOO_CONFIG_DIR=/tmp/promptfoo-import-trace npm run local -- import /tmp/trace-export.json
   ```

   Inspect the source and imported trace/span counts for the eval ID.

3. Verify blob portability with and without embedded media:

   ```sh
   npm run local -- export eval <media-eval-id> -o /tmp/media-refs-only.json
   npm run local -- export eval <media-eval-id> --include-media -o /tmp/media-portable.json
   PROMPTFOO_CONFIG_DIR=/tmp/promptfoo-import-media npm run local -- import /tmp/media-portable.json
   ```

   Confirm the refs-only export keeps `promptfoo://blob/...` references without
   `blobAssets`, and the portable import restores the referenced blob assets and
   references in the isolated target data directory.

4. Exercise backwards compatibility by importing a legacy export fixture that
   has no `vars`, `runtimeOptions`, `traces`, or `blobAssets`.

5. Run final changed-surface checks:

   ```sh
   npm run tsc
   npm run l
   npm run f
   ```

   If repo-local lint discovers unrelated worktree config files, record the
   blocker and keep the focused tests plus changed-file checks in the evidence.
