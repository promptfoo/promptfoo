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

## QA Plan

### QA Objectives

The QA pass must prove that the parity changes preserve eval data that is safe
and self-contained, keep older exports importable, and do not widen the data
exfiltration surface of export files.

An eval export/import parity change is ready only when all of these are true:

1. Current exports round trip the in-scope eval identity, config, results,
   explicit vars, runtime metadata, durations, traces, and opt-in media.
2. Default exports stay refs-only for blob media and remain meaningfully smaller
   than portable media exports.
3. Existing import formats still work when newer fields are absent.
4. Collision behavior remains explicit: preserve IDs by default, duplicate with
   `--new-id`, replace only with `--force`.
5. The export artifact is sanitized consistently whether written to stdout or
   to a file.
6. Import treats export files as hostile input. Malformed traces or media do
   not crash the import or write unvalidated bytes.
7. Strip and redaction controls still apply to every exported surface that can
   carry user data. Trace metadata must not become a side channel around result
   stripping.

### Risk Map

| Risk                                             | Why it matters                                                                 | QA response                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Result fields disappear after import             | Imported evals become misleading or unusable                                   | Compare source export payload, imported DB record, and re-exported payload for scoped eval fields. |
| Unused eval vars disappear                       | Explicit suite state is lost even when no row happens to use a var             | Include vars unused by every result row and assert they survive round trip.                        |
| Trace IDs collide on duplicate import            | New spans could attach to the original eval or uniqueness constraints can fail | Import the same trace export with `--new-id` and verify eval and trace IDs are remapped.           |
| Blob URIs survive but bytes do not               | Media output appears present while the target data directory cannot render it  | Test refs-only exports and `--include-media` exports in a clean target data directory.             |
| Embedded media becomes an unsafe import path     | Export files can carry large, corrupt, or mislabeled content                   | Exercise hash, size, encoding, shape, and missing-reference failures.                              |
| Sanitizers differ between stdout and file output | A safer path can be bypassed by changing export destination                    | Diff redacted fields across both sinks.                                                            |
| Trace metadata bypasses result strip flags       | Vars or metadata intentionally removed from results can leak through traces    | Run strip-policy exports and inspect trace metadata, span attributes, and result rows.             |
| Legacy exports stop importing                    | Existing artifacts become stranded                                             | Keep versioned fixture imports with fields omitted and assert legacy defaults.                     |
| Replacement semantics drift                      | `--force` can accidentally merge or orphan data                                | Inspect eval, trace, blob reference, and count behavior after replace and duplicate imports.       |

### Test Corpus

Use small deterministic evals first, then one representative real eval only if
it is safe to export locally. Keep secrets out of the corpus.

| Corpus item                 | Required content                                                                                        | Primary checks                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `baseline`                  | Two prompts, passing and failing results, grading, metrics, duration stats                              | Results, stats, timestamps, author, config, durations                 |
| `explicit-vars`             | Eval vars used by result rows plus one eval var never used by any result row                            | Explicit eval vars versus row-local vars                              |
| `redaction`                 | Secret-looking config keys, result metadata, result vars, trace metadata, sensitive span attribute keys | Config sanitizer, strip flags, trace projection                       |
| `trace`                     | One trace with multiple spans, nested attributes, error state, token usage, and an eval association     | Trace counts, span counts, eval ID mapping, attribute sanitization    |
| `media`                     | Results referencing at least two blob URIs, one duplicate content reference, and one non-blob URI       | Refs-only behavior, portable asset dedupe, missing-reference handling |
| `legacy-v2` and `legacy-v3` | Existing export shapes without parity fields                                                            | Backwards-compatible parsing and defaults                             |
| `hostile-import`            | Corrupt blob hash, oversized blob bytes, malformed trace, malformed blob asset, unexpected field types  | Untrusted input handling                                              |

### Environment And Evidence Rules

1. Run from the repository root and align Node before Node-based QA:

   ```sh
   source ~/.nvm/nvm.sh
   nvm use
   ```

2. Use separate `PROMPTFOO_CONFIG_DIR` directories for source and target data
   whenever testing import portability. Never point destructive import checks at
   the user's default Promptfoo data directory.

   ```sh
   PROMPTFOO_CONFIG_DIR=/tmp/promptfoo-export-source npm run local -- eval -c <config> --no-cache -o /tmp/source-results.json
   PROMPTFOO_CONFIG_DIR=/tmp/promptfoo-export-target npm run local -- import /tmp/export.json
   ```

3. Do not clear `~/.promptfoo/cache` or delete a real Promptfoo database during
   QA. Use `--no-cache` for new eval runs and isolated config directories for
   import targets.
4. Capture exact commands, the source eval ID, imported eval ID, import mode,
   export flags, target config directory, test results, and any blocker.
5. Inspect JSON rather than trusting exit code alone. Check result success,
   score, error, vars, metadata, provider output, trace data, blob refs, and
   the parity fields under review.
6. Use a fresh temp target for each destructive or negative import lane so a
   partially rejected hostile file does not pollute later checks.

### Coverage Matrix

Every release-quality QA pass should cover the matrix below. Unit tests can
cover many cells, but at least one source CLI and one built CLI round trip
should cover each high-risk surface.

| Dimension            | Required variants                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| Export sink          | stdout JSON, `-o <file>` JSON                                                                            |
| Export media mode    | default refs-only, `--include-media` portable                                                            |
| Import format        | current export, legacy v2 fixture, legacy v3 fixture                                                     |
| Import identity mode | default ID preservation, `--new-id`, `--force` replacement                                               |
| Data surface         | config, result table, explicit vars, runtime options, durations, traces, blob refs, embedded blob assets |
| Target storage       | existing source data directory, empty isolated target data directory                                     |
| Privacy controls     | default behavior, `PROMPTFOO_STRIP_TEST_VARS=true`, `PROMPTFOO_STRIP_METADATA=true`, both flags together |
| Failure shape        | missing optional fields, malformed optional fields, corrupt blob, oversize blob, trace collision         |

### Automated Test Plan

#### Focused Unit And Integration Tests

Run the changed-surface suite after each parity slice:

```sh
npx vitest run \
  test/commands/import.test.ts \
  test/commands/export.test.ts \
  test/util/jsonExport.test.ts \
  test/util/output.test.ts \
  test/tracing/store.test.ts
```

The focused tests should assert all of the following:

1. Exported current eval data includes explicit eval vars, runtime options, and
   duration fields when those records contain them.
2. Exports still omit newer optional fields cleanly when source data lacks them.
3. File exports and stdout exports pass through the same config sanitizer.
4. Import accepts current payloads with traces and blob assets.
5. Import accepts old payloads without vars, runtime options, traces, or blob
   assets.
6. `--new-id` keeps imported trace IDs distinct from source trace IDs.
7. Blob assets are imported before result extraction so imported results can
   record present blob refs.
8. A corrupt or oversized embedded asset is rejected or skipped according to
   the import contract without writing unvalidated content.
9. Malformed traces are skipped without failing the eval import if traces are an
   optional extension surface.
10. Missing media in the source blob provider does not invent bytes in the
    export.

#### Regression Tests To Add Or Keep

These cases are high-value regressions even if the implementation changes:

| Regression case                                           | Expected behavior                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Secret-like config field exported to stdout               | Redacted exactly as for file output.                                                              |
| Unused explicit eval var                                  | Present after import and after re-export.                                                         |
| Duration and runtime options missing from a legacy export | Import succeeds with legacy defaults.                                                             |
| Duplicate trace import with `--new-id`                    | Imported eval gets separate trace IDs and spans associated to the imported eval.                  |
| Default blob export                                       | Blob URIs remain in results, `blobAssets` is absent, no source blob bytes are copied.             |
| Portable blob export                                      | Referenced blob assets are embedded once, hash-valid, and restored in a clean target.             |
| Corrupt content-addressed blob hash                       | Import rejects the bytes and does not create a misleading valid blob.                             |
| Embedded blob larger than the import limit                | Import enforces the limit before writing bytes.                                                   |
| Result strip flags plus tracing                           | Stripped vars and metadata do not reappear in trace metadata or any other exported trace surface. |

The strip-policy trace regression is a mandatory gate. A QA pass must export a
trace-bearing eval with both strip flags and verify that result rows, trace
metadata, and span attribute projection all follow the intended privacy model.
If traces preserve data that the result export path strips, stop and decide
whether to sanitize, omit, or explicitly document that surface before shipping.

#### Broader Regression Sweep

Before the branch is treated as ready, run a wider test slice over the data
paths that export/import transitively depend on:

```sh
npx vitest run \
  test/commands/import.test.ts \
  test/commands/export.test.ts \
  test/models/eval.test.ts \
  test/models/evalResult.test.ts \
  test/tracing \
  test/util/output.test.ts \
  test/util/jsonExport.test.ts \
  test/blobs
```

Then run the static and build checks:

```sh
npm run tsc
npm run build
npm run l
npm run f
```

If repo-local lint or format commands discover unrelated nested worktree config
files, record the exact blocker. Keep focused tests, changed-file formatting,
typecheck, build, and real CLI round trips in the QA evidence rather than
claiming the full lane passed.

### Source CLI Round-Trip Plan

#### Baseline Eval Round Trip

1. Run or select a baseline eval in an isolated source directory.
2. Export to a file and capture the eval ID:

   ```sh
   PROMPTFOO_CONFIG_DIR=/tmp/promptfoo-export-source npm run local -- export eval <baseline-eval-id> -o /tmp/baseline-export.json
   ```

3. Import into an empty target directory:

   ```sh
   PROMPTFOO_CONFIG_DIR=/tmp/promptfoo-import-baseline npm run local -- import /tmp/baseline-export.json
   ```

4. Re-export the imported eval from the target.
5. Compare scoped fields:
   - Eval ID, author, created timestamp, prompts, result count, stats.
   - Result outputs, grading results, success, score, error, metadata behavior.
   - Explicit eval vars including unused vars.
   - Runtime options and durations when present.
6. Record intentionally non-portable rows that do not appear after import:
   tags, dataset links, cache state, share state, logs, or unrelated local DB
   joins.

#### Identity Collision Round Trip

1. Import the same export into a target that already has that eval ID.
2. Verify the default import fails with a useful collision message and does not
   silently replace data.
3. Re-run with `--new-id` and verify:
   - A distinct eval ID is created.
   - Source created time and author behavior match the import contract.
   - Trace IDs and span associations do not point back to the original eval.
4. Re-run with `--force` in a disposable target and verify:
   - The original eval ID is replaced only after explicit force.
   - The imported eval has expected result and trace counts.
   - No stale data from the replaced eval is mistaken for new parity data.

#### Trace Round Trip

1. Export a trace-bearing eval:

   ```sh
   PROMPTFOO_CONFIG_DIR=/tmp/promptfoo-export-source npm run local -- export eval <trace-eval-id> -o /tmp/trace-export.json
   ```

2. Inspect the export and record trace count, span count, top-level eval ID,
   trace IDs, sanitized sensitive attributes, and any trace metadata chosen for
   export.
3. Import into a clean target:

   ```sh
   PROMPTFOO_CONFIG_DIR=/tmp/promptfoo-import-trace npm run local -- import /tmp/trace-export.json
   ```

4. Query or re-export the imported eval and verify:
   - Trace count and span count match expected scoped data.
   - Imported traces attach to the imported eval ID.
   - `--new-id` remaps globally unique trace IDs.
   - Sensitive span attributes remain redacted or truncated as intended.
   - Trace metadata follows the approved vars and metadata policy.

#### Media Round Trip

1. Export a media-bearing eval without portable bytes:

   ```sh
   PROMPTFOO_CONFIG_DIR=/tmp/promptfoo-export-source npm run local -- export eval <media-eval-id> -o /tmp/media-refs-only.json
   ```

2. Confirm the JSON keeps `promptfoo://blob/...` result references but omits
   `blobAssets`.
3. Import the refs-only file into an empty target and verify the artifact does
   not claim to have restored unavailable bytes.
4. Export the same source eval with portable media:

   ```sh
   PROMPTFOO_CONFIG_DIR=/tmp/promptfoo-export-source npm run local -- export eval <media-eval-id> --include-media -o /tmp/media-portable.json
   ```

5. Confirm only referenced blob assets are embedded, duplicate content is not
   inflated unnecessarily, and hash and byte length metadata look coherent.
6. Import into a different empty target:

   ```sh
   PROMPTFOO_CONFIG_DIR=/tmp/promptfoo-import-media npm run local -- import /tmp/media-portable.json
   ```

7. Verify referenced bytes exist in the target blob provider, result refs remain
   usable, non-blob URIs are unchanged, and unrelated source blob assets were not
   copied.

#### Strip And Redaction Round Trip

1. Construct a trace-bearing eval that has result vars, result metadata, trace
   metadata vars, config fields with secret-like keys, and sensitive span
   attributes.
2. Export it with the result strip flags enabled:

   ```sh
   PROMPTFOO_STRIP_TEST_VARS=true PROMPTFOO_STRIP_METADATA=true \
     PROMPTFOO_CONFIG_DIR=/tmp/promptfoo-export-source \
     npm run local -- export eval <redaction-eval-id> -o /tmp/redaction-export.json
   ```

3. Repeat the export to stdout and save the stdout artifact for comparison.
4. Verify:
   - Secret-like config fields are redacted in both sinks.
   - Result vars and result metadata are stripped as configured.
   - Trace metadata does not reintroduce stripped vars or metadata.
   - Sensitive trace attributes stay under the trace sanitizer policy.
   - Importing the sanitized artifact cannot restore data that export removed.

### Built CLI Verification

Source CLI QA catches behavior while iterating. A final parity pass should also
exercise the built entrypoint so the release artifact path is not inferred from
TypeScript tests alone.

1. Build the repository:

   ```sh
   npm run build
   ```

2. Repeat at least one baseline import, one trace import, and one portable media
   import through the built CLI entrypoint:

   ```sh
   PROMPTFOO_CONFIG_DIR=/tmp/promptfoo-built-target node dist/src/main.js import /tmp/baseline-export.json
   ```

3. Run the built export command once for a safe source eval and confirm its
   stdout and file behavior match the source CLI export contract.

### Legacy And Forward-Tolerant Import Plan

1. Import existing v2 and v3 export fixtures.
2. Verify missing current fields are treated as optional:
   `vars`, `runtimeOptions`, duration stats, `traces`, and `blobAssets`.
3. Verify unknown fields do not corrupt the eval data that is recognized.
4. Re-export the imported legacy eval and confirm the current exporter produces
   a valid current artifact from the legacy import.
5. Keep at least one fixture that has no media or trace extensions so future
   changes cannot make those extensions accidentally required.

### Hostile Import Plan

Run each hostile payload in a fresh isolated target directory. The import path
must neither trust file shape nor rely on a friendly exporter.

| Hostile case                                      | Expected check                                                                                            |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Blob hash does not match bytes                    | Bytes are not accepted under the claimed content address.                                                 |
| Blob bytes exceed `BLOB_MAX_SIZE`                 | Limit is enforced before blob write.                                                                      |
| Blob asset has invalid base64, type, or shape     | Asset is skipped or rejected according to contract without crashing unrelated eval import.                |
| Export references blob URI with no embedded asset | Import preserves honest refs-only semantics and does not synthesize data.                                 |
| Trace entry lacks required structure              | Trace is skipped safely.                                                                                  |
| Trace IDs collide under duplicate import          | Duplicate import uses remapped trace identity where required.                                             |
| Export config contains secret-like values         | Export sanitizer remains the only source of redacted config artifacts. Import does not unredact anything. |
| Large or adversarial optional arrays              | Parser and importer preserve limits and error handling rather than partial unsafe writes.                 |

For negative tests, inspect both the command result and target storage. A warning
or success code is insufficient if invalid bytes or traces were still persisted.

### Storage Inspection

CLI output is not enough for trace and blob parity. Inspect the target storage
after imports:

1. Read the imported eval through the same app/model path used by exports and
   re-export it for a user-facing comparison.
2. Inspect trace counts and span associations for the source and target eval
   IDs. The counts should match the in-scope traces, and target associations
   should not point at the source eval ID after `--new-id`.
3. Inspect blob storage through provider APIs or database bookkeeping, not by
   guessing filesystem paths. Confirm present blob refs correspond to bytes
   actually restored in the target provider.
4. Confirm replacement QA does not leave stale result rows or traces being
   counted as imported parity state.

### Documentation And UX Checks

1. Check CLI help for import and eval export flags.
2. Verify docs describe:
   - Data preserved by import.
   - Older export compatibility.
   - `--new-id` and `--force`.
   - Default refs-only media behavior.
   - Opt-in `--include-media` portability and sensitivity tradeoff.
3. Verify error text for duplicate IDs and invalid media is actionable without
   revealing secret values or raw media payloads.
4. Check documentation formatting for touched Markdown:

   ```sh
   npx prettier --check docs/plans/eval-export-import-parity.md site/docs/usage/command-line.md
   ```

### Final Evidence Checklist

The final QA note for the branch should record:

1. Commit SHA and branch tested.
2. Focused tests, broader regression sweep, typecheck, and build results.
3. Any lint or format blockers with the exact unrelated path that caused them.
4. Source CLI baseline, trace, media, strip/redaction, and collision commands.
5. Built CLI import/export commands.
6. Legacy fixture imports and expected legacy defaults.
7. Hostile payload cases tested and storage observations.
8. Explicit GAP list for data intentionally not recovered.
9. Open privacy or correctness findings. The trace strip-policy check is a ship
   blocker until the approved data model is reflected in code and regression
   coverage.
