# Eval Export And Import Parity QA Notes

## Run Metadata

| Field       | Value                                            |
| ----------- | ------------------------------------------------ |
| Date        | 2026-05-20                                       |
| Branch      | `mdangelo/codex/eval-export-import-parity`       |
| Scope       | `promptfoo export eval` and `promptfoo import`   |
| QA plan     | `docs/plans/eval-export-import-parity.md`        |
| Data policy | Isolated temp Promptfoo config directories only. |

## Evidence Log

### Preflight

- Read the branch QA plan, `src/commands/AGENTS.md`, and `test/AGENTS.md`.
- Mapped the changed export/import path through:
  - `src/commands/export.ts`
  - `src/commands/import.ts`
  - `src/util/output.ts`
  - `src/tracing/store.ts`
  - `src/tracing/evaluatorTracing.ts`
- Verified existing focused tests already cover imported vars, runtime options,
  durations, trace import and `--new-id` trace remapping, portable blob import,
  corrupt embedded blob hashes, and eval ID collisions.
- Verification target before treating the privacy lane as green: trace metadata
  must not bypass `PROMPTFOO_STRIP_TEST_VARS` or `PROMPTFOO_STRIP_METADATA`.

### Automated QA

- Direct `nvm use` was unavailable in the non-interactive shell. Node QA
  commands source `~/.nvm/nvm.sh` and run `nvm use` before invoking repo tools.
- Focused changed-surface suite passed:

  ```sh
  /bin/zsh -lc 'source ~/.nvm/nvm.sh && nvm use >/dev/null && npx vitest run test/commands/import.test.ts test/commands/export.test.ts test/util/jsonExport.test.ts test/util/output.test.ts test/tracing/store.test.ts'
  ```

  Result: 5 test files passed, 92 tests passed.

- Broader eval/export storage sweep passed:

  ```sh
  /bin/zsh -lc 'source ~/.nvm/nvm.sh && nvm use >/dev/null && npx vitest run test/commands/import.test.ts test/commands/export.test.ts test/models/eval.test.ts test/models/evalResult.test.ts test/tracing test/util/output.test.ts test/util/jsonExport.test.ts test/blobs'
  ```

  Result: 21 test files passed, 477 tests passed.

- Typecheck passed:

  ```sh
  /bin/zsh -lc 'source ~/.nvm/nvm.sh && nvm use >/dev/null && npm run tsc'
  ```

- Build passed:

  ```sh
  /bin/zsh -lc 'source ~/.nvm/nvm.sh && nvm use >/dev/null && npm run build'
  ```

  The build completed `tsc`, `tsdown`, the app Vite build, and postbuild file
  copying. It emitted existing build warnings about deprecated tsdown options,
  ineffective dynamic imports, and plugin timing.

### Source CLI Baseline And Collisions

- Ran a fresh baseline eval from `test/smoke/fixtures/configs/basic.yaml` with
  `PROMPTFOO_CONFIG_DIR=/private/tmp/promptfoo-export-import-qa-baseline-source`.
  The local CLI created `eval-K3j-2026-05-20T17:03:41` and wrote
  `/private/tmp/promptfoo-export-import-qa/baseline-eval-output.json`.
- Exported the source eval to
  `/private/tmp/promptfoo-export-import-qa/baseline-export.json`, imported it
  into `PROMPTFOO_CONFIG_DIR=/private/tmp/promptfoo-export-import-qa-baseline-target`,
  and re-exported it to
  `/private/tmp/promptfoo-export-import-qa/baseline-reexport.json`.
- Scoped artifact comparison matched across the source export and target
  re-export: eval ID, v3 format, one prompt, one result, one success, config
  description, `vars: ["name"]`, and CLI runtime options.
- Re-importing the same export without an identity option failed with the
  expected collision message naming both `--new-id` and `--force`.
- Re-importing with `--new-id` succeeded as
  `eval-WTi-2026-05-20T17:03:41`. SQLite inspection of the target showed both
  the preserved source ID and the duplicate ID.
- In a separate force target, importing the baseline export and then importing
  it again with `--force` logged replacement of
  `eval-K3j-2026-05-20T17:03:41`. SQLite inspection showed one eval and one
  result row afterward.

### Trace And Media Round Trips

- Ran `examples/integration-opentelemetry/javascript/promptfooconfig.yaml` in
  `PROMPTFOO_CONFIG_DIR=/private/tmp/promptfoo-export-import-qa-trace-source`.
  The local CLI wrote `eval-Kr7-2026-05-20T17:05:25`, two trace rows, and 24
  span rows.
- The tracing example returned the eval failure exit code because trace duration
  checks failed. One row also reported no `rag_agent_workflow` span at assertion
  time even though the final exported trace set had the trace rows. Export QA
  continued from the persisted trace data.
- Exported and re-imported the trace eval into
  `/private/tmp/promptfoo-export-import-qa-trace-target`. The target preserved
  two traces and 24 spans on re-export.
- Importing the same trace export with `--new-id` created
  `eval-JJJ-2026-05-20T17:05:25`. SQLite inspection showed two remapped trace
  IDs for the duplicate eval while the original imported eval kept the source
  trace IDs.
- Seeded the media lane by importing a deterministic portable export with one
  39-byte `image/png` blob, two appearances of the same blob URI inside result
  output text, one non-blob URL, explicit `vars` including
  `unused_export_var`, runtime options, and duration stats.
- Re-exporting the media seed without `--include-media` produced refs-only JSON
  with no `blobAssets`. Re-exporting with `--include-media` embedded one asset
  for the repeated content and preserved the non-blob URL, explicit vars,
  runtime options, and duration stats.
- Importing refs-only media JSON into an empty target left zero blob asset and
  zero blob reference rows, as expected.
- Importing portable media JSON into an empty target created the blob asset and
  allowed a portable re-export with the asset intact. The first storage
  inspection found no `blob_references` row for blob URIs embedded inside
  surrounding output text; that is tracked as finding F2 below.

### Strip And Redaction Projection

- Exported the persisted trace eval with
  `PROMPTFOO_STRIP_TEST_VARS=true` and `PROMPTFOO_STRIP_METADATA=true`.
- Result rows, result metadata, test-case vars, and test-case metadata were
  stripped in `/private/tmp/promptfoo-export-import-qa/trace-strip-export.json`.
- The first export still contained the original per-test trace metadata `vars`.
  That reproduced finding F1 below.
- After the trace projection fix, re-exported to
  `/private/tmp/promptfoo-export-import-qa/trace-strip-export-fixed.json`.
  Both traces omitted metadata in the combined metadata strip case while result
  vars and result metadata remained stripped.
- Imported `/private/tmp/promptfoo-export-import-qa/redaction-seed.json` into a
  clean target and exported the eval to both a file and stdout. The fake
  provider `apiKey` and fake `ANTHROPIC_API_KEY` were `[REDACTED]` in both
  sinks; `REGION` and the provider label remained intact.

### Legacy, Hostile, Help, And Built CLI

- Imported the existing v3 fixture `test/__fixtures__/sample-export.json` into
  an isolated target and re-exported it as a current artifact. The target kept
  `vars: ["riddle"]` and four result rows.
- Imported a valid table-backed v2 artifact with `version: 2`, table-backed
  results, author, timestamp, and no parity extensions. Re-export kept the
  legacy v2 summary, table vars, one result row, author, and timestamp.
- A provisional versionless pseudo-v2 seed lacked both the current v3 prompt
  shape and the legacy v2 table. The first QA pass showed it could import and
  later re-export without its result rows. After import preflight hardening, a
  fresh import rejects it with `Unsupported eval export results format` and
  target storage stays empty.
- Imported malformed optional extension arrays containing malformed blob asset
  entries and malformed trace entries. The eval imported while target storage
  kept zero trace rows and zero blob assets for those skipped entries.
- Import trace preflight also skipped a malformed span entry inside an otherwise
  importable trace before storage writes.
- Corrupt embedded blob hash and oversized embedded blob imports both failed in
  empty targets before writing evals or blob assets.
- Forced a corrupt replacement over an existing baseline eval. Before the
  replacement preflight fix, `--force` deleted the existing eval before the
  blob hash error. After the fix, the same source CLI replay fails the import
  and target storage still has one baseline eval row and one result row.
- Checked `npm run local -- import --help` and
  `npm run local -- export eval --help`. Help lists `--new-id`, `--force`,
  output path, and `--include-media`.
- Rebuilt after the import and media fixes, then ran `node dist/src/main.js`
  imports for baseline, trace, and portable media exports into fresh targets.
  Storage inspection showed one baseline result row, two trace rows with 24
  spans, and one portable blob asset with one mixed-string blob reference.
- Ran built export through both a file sink and stdout from the baseline source
  eval. The built file kept the expected current export ID, one result,
  `vars: ["name"]`, and runtime options; stdout emitted the same JSON shape.

### Final Validation

- Re-ran the broader eval/export storage sweep after all import hardening:

  ```sh
  /bin/zsh -lc 'source ~/.nvm/nvm.sh && nvm use >/dev/null && npx vitest run test/commands/import.test.ts test/commands/export.test.ts test/models/eval.test.ts test/models/evalResult.test.ts test/tracing test/util/output.test.ts test/util/jsonExport.test.ts test/blobs'
  ```

  Result: 21 test files passed, 483 tests passed.

- Re-ran `npm run tsc`; it passed.
- Re-ran `npm run build`; it passed with the same tsdown deprecation, dynamic
  import, and plugin timing warnings noted earlier.
- Ran `npm run l`. Changed-file lint completed with existing complexity warnings
  in `src/blobs/extractor.ts` and `src/models/eval.ts`; it did not report new
  lint errors or apply fixes.
- Ran documentation formatting on the touched Markdown after formatting this
  note:

  ```sh
  /bin/zsh -lc 'source ~/.nvm/nvm.sh && nvm use >/dev/null && npx prettier --check docs/plans/eval-export-import-parity.md docs/plans/eval-export-import-parity-qa-notes.md site/docs/usage/command-line.md'
  ```

  Result: all checked Markdown matched Prettier style.

## QA Checklist

| Lane                                           | Status | Notes                                                                                                                     |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| Focused export/import unit tests               | Passed | 5 files, 92 tests.                                                                                                        |
| Broader data-path regression sweep             | Passed | 21 files, 477 tests.                                                                                                      |
| Typecheck and build                            | Passed | Typecheck and full build passed.                                                                                          |
| Source CLI baseline round trip                 | Passed | Baseline source export, target import, and re-export matched scoped fields.                                               |
| Source CLI trace round trip                    | Passed | 2 traces and 24 spans preserved; `--new-id` remapped trace IDs.                                                           |
| Source CLI media refs-only and portable import | Passed | First pass found F2; fixed import restored portable bytes and mixed-string blob refs.                                     |
| Collision semantics                            | Passed | Default collision failed; `--new-id` duplicated; `--force` replaced in a disposable target.                               |
| Strip and redaction projection                 | Passed | First pass found F1; strip flags now project trace metadata and file/stdout config redaction matched.                     |
| Legacy v2/v3 import compatibility              | Passed | Existing v3 fixture and valid table-backed v2 artifact imported and re-exported.                                          |
| Hostile trace/blob import cases                | Passed | Corrupt hash, oversize asset, malformed optional arrays, unsupported results, and failed `--force` replacement exercised. |
| Built CLI import/export smoke                  | Passed | Rebuilt `dist` and ran baseline, trace, media imports plus baseline export file/stdout.                                   |
| Docs/help validation                           | Passed | CLI help checked; touched Markdown passed Prettier.                                                                       |

## Findings

### F1: Trace Metadata Bypasses Result Strip Flags

Status: fixed and regression-tested.

`PROMPTFOO_STRIP_TEST_VARS=true` and `PROMPTFOO_STRIP_METADATA=true` remove the
same data from result rows and test cases, but the newly exported trace payload
still includes trace metadata such as:

```json
{
  "testIdx": 0,
  "promptIdx": 0,
  "vars": {
    "topic": "quantum computing"
  }
}
```

This created an export-side side channel around the result projection policy.
`src/util/output.ts` now projects trace metadata through the same strip flags,
and regression coverage checks both trace-var removal and full metadata removal.

### F2: Mixed-String Blob URIs Miss Reference Bookkeeping On Import

Status: fixed and regression-tested.

Portable media import stores embedded bytes before results. When result output is
exactly `promptfoo://blob/<hash>`, the existing result extractor records the
local reference. When the same URI appears inside surrounding output text, the
portable target receives the blob asset and can re-export it, but
`blob_references` remains empty for that imported eval. Export already scans
mixed strings for blob URI hashes, so import bookkeeping should match it.

The extractor now finds embedded blob URIs inside surrounding strings and
deduplicates repeated hashes before recording result references.

### F3: Failed Forced Replacement Deletes The Existing Eval

Status: fixed and regression-tested.

The first corrupt replacement replay imported a baseline eval, ran
`promptfoo import --force` on a same-ID artifact with a mismatched embedded blob
hash, and then found zero eval and result rows. Import used to delete the old
eval before blob validation had established that the replacement artifact was
usable.

Import now preflights current-vs-legacy result shape, embedded blob hashes, and
trace/span shapes before forced replacement. Regression coverage confirms a
corrupt replacement fails while the existing eval and its result rows remain
present.
