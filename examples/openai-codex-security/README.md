# openai-codex-security (Compare Source Reviews and Saved Reports)

Compare Luna and Terra at medium reasoning effort on the same pinned OWASP Juice Shop source. Import saved results to review and grade them without repeating scans. [benchmark-results.json](benchmark-results.json) records a real six-attempt comparison; original reports and private SDK state are not bundled.

## Setup

```bash
npx promptfoo@latest init --example openai-codex-security
cd openai-codex-security
npm install promptfoo @openai/codex-security@^0.1.31
```

Native operations require supported Node.js, Python 3.10+, and Codex Security account/model access. The example uses a saved Codex login (`auth: chatgpt`); change both providers to `auth: api-key` to use process-environment API credentials. See [installation and authentication](https://www.promptfoo.dev/docs/providers/openai-codex-security/#installation-and-authentication).

Prepare clean source without installing or running Juice Shop:

```bash
git clone --branch v19.0.0 --single-branch https://github.com/juice-shop/juice-shop.git juice-shop-v19
git -C juice-shop-v19 checkout --detach 36870cbbdfe7864698e1adf644c7bf772f67ebb7
export CODEX_SECURITY_REPOSITORY="$PWD/juice-shop-v19"
```

The config selects 14 files / 1,621 source lines at this revision. Both providers use the same prompt, medium effort, three-thread limit, and $5 estimated scan-spend threshold. That threshold is per operation, can be exceeded by in-flight work, and is not a billing cap.

## Compare source reviews

```bash
npx promptfoo@latest eval --max-concurrency 1 --no-cache -o comparison-live.json
npx promptfoo@latest view
```

This starts two real SDK operations. [prompt.txt](prompt.txt) requests source inspection and source-based validation only, without running the target or reproducing vulnerabilities. It includes intentional flaws but excludes challenge catalogs, codefixes, tests, solutions, previous reports, and benchmark answers. These are prompt instructions, not filesystem enforcement; review recorded tool use before accepting protocol compliance. Inline annotations remain visible in this known public repository.

The two assertions check completion and coverage, not detection quality. Keep the config, full native eval export, source hashes, and independently reviewed evidence. Labels describe requested settings; actual session observations, versions and usage are needed to support attribution. A source-supported finding does not establish runtime exploitability.

## Recorded case study

The [guide](https://www.promptfoo.dev/docs/guides/codex-security-results/#recorded-juice-shop-comparison) describes three planned repeats per model against 11 frozen, independently source-reviewed causes. Both configurations delivered 12 expected-cause matches across 33 planned opportunities (36.36%). Each had two eligible reports, with mean curated recall 54.55% among those reports. One attempt failed publication; another violated the excluded-answer reading policy. Their recall is **not scored**, and their delivery contribution is zero. All attempts retain resource use.

The receipt records hashes, source files, requested and observed settings, eligibility, findings, warnings, adjudication counts, usage and estimated cost. The recorded protocol used fresh SDK state for each attempt, sequential counterbalanced order, SDK 0.1.31/plugin 0.1.95 and CLI 0.156.1. The portable config runs one pair; it does not reproduce the three-repeat schedule or automatically reset SDK state. Three planned repeats do not establish a general model ranking.

## Compare saved reports

`promptfooconfig.reports.yaml` imports two local files using the native provider. Import requires no SDK, Python, or model credentials. Prefer Promptfoo replay files to preserve normalized native diagnostics, warnings, operation and historical usage. Direct SDK `ScanResult.toJSON()` files are also supported, but SDK 0.1.31 omits runtime operation and recovery warnings.

Keep the full native eval export. To extract portable replay files from a new export, run this in the example directory:

```bash
node --input-type=module <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
const exported = JSON.parse(readFileSync('comparison-live.json', 'utf8'));
for (const [label, file] of [
  ['Luna medium', 'report-luna.json'],
  ['Terra medium', 'report-terra.json'],
]) {
  const rows = exported.results.results.filter(row => row.provider?.label === label);
  if (rows.length !== 1) throw new Error(`Expected one result for ${label}`);
  const { response } = rows[0];
  const replay = response.metadata?.codexSecurityReplay;
  if (!replay) throw new Error(`Export lacks replay metadata for ${label}`);
  const value = response.raw ?? null;
  const payload = typeof value === 'string' ? JSON.parse(value) : value;
  writeFileSync(file, JSON.stringify({ ...replay, payload }, null, 2) + '\n', { flag: 'wx' });
}
JS
export CODEX_SECURITY_BASELINE_REPORT="$PWD/report-luna.json"
export CODEX_SECURITY_CANDIDATE_REPORT="$PWD/report-terra.json"
npx promptfoo@latest eval -c promptfooconfig.reports.yaml --no-cache -o comparison-reports.json
npx promptfoo@latest view
```

Extraction refuses to overwrite files. The provider validates the replay envelope and payload hash on import; a hash binds content, not the producer's identity. Failed replay records retain failure diagnostics and may have no canonical payload. Entire eval exports and bare findings arrays are not report inputs. Missing or invalid files never trigger a fallback scan. Import incurs no new model usage; recorded scan cost and duration are historical.

## Grade independently reviewed findings

[grade-benchmark.mjs](grade-benchmark.mjs) exports `completedScan`, `completeCoverage`, `gradeBenchmark` and `evidenceHash`. The quality helper consumes the provider's normalized metadata and original SDK-shaped output; it does not normalize reports or discover/adjudicate findings.

After reviewing your reports, add this assertion to the saved-report config. **Do not add `metric:` to the quality assertion**: it emits named metrics only when their evidence is valid.

```yaml
defaultTest:
  assert:
    - type: javascript
      metric: CompletedScan
      value: file://grade-benchmark.mjs:completedScan
    - type: javascript
      metric: CompleteCoverage
      value: file://grade-benchmark.mjs:completeCoverage
    - type: javascript
      value: file://grade-benchmark.mjs:gradeBenchmark
      config:
        benchmark: file://benchmark.json
```

The helper resolves relative `file://` benchmark paths from its own directory; absolute paths also work. It loads this data for grading only, without adding it to the scan prompt. Create the benchmark data file from actual independent reviews:

| Field                        | Meaning                                                                                                                                                                                                                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `definition`                 | `{ revision, sourceSnapshotSha256, groundTruthSha256, scope: { includePaths, excludePaths }, expectedIds }`. Freeze the curated definition before examining outputs. Path arrays and expected IDs must be unique; expected IDs cannot be empty.                                                                 |
| `definitionSha256`           | `evidenceHash(definition)`. Source snapshot/ground-truth hashes identify independently preserved evidence; verify that evidence separately.                                                                                                                                                                     |
| `reports`                    | Object keyed by the SHA-256 of the exact imported file bytes (raw SDK file or replay file). Repackaging a report changes this identity.                                                                                                                                                                         |
| `reports[hash].review`       | `{ definitionSha256, protocolValid, provenanceValid, findings }`; both validity flags must be explicitly `true` for quality scoring. Optional `ineligibleReason` explains exclusion.                                                                                                                            |
| `review.findings`            | Every current SDK finding ID mapped to one or more independently reviewed claims. Each claim is `{ rootCauseId, verdict, inScope, expectedIds, evidence }`. Verdict is `supported`, `refuted` or `unresolved`. Use stable root-cause IDs to deduplicate; only supported in-scope claims may match expected IDs. |
| `reports[hash].reviewSha256` | `evidenceHash(review)`; freeze after adjudication. Preserve original review evidence and its file hashes separately.                                                                                                                                                                                            |

`evidenceHash` hashes UTF-8 JSON with recursively sorted object keys; array order is retained. It detects changes to the supplied definition/review, not a dishonest reviewer or incorrect source identity. Scope comparison ignores path order and narrative wording; review assumptions and dirty-worktree identity separately. Keep original SDK output for grading; transformed output that drops finding IDs cannot be scored.

An eligible empty report measures zero curated recall. Missing review, invalid protocol, mismatched source/hash, incomplete finding adjudication or an empty expected set instead returns **Not scored**, null quality metadata and no quality named metrics. Promptfoo still records an overall failed evidence check with numeric score zero; use `CuratedRecall`, not overall score, for recall averages.

`CuratedRecall` counts unique matched expected IDs. `PrecisionLower` is supported / (supported + refuted + unresolved); `PrecisionUpper` includes unresolved claims in its numerator. These are adjudication bounds, not confidence intervals. Empty claim denominators remain undefined. Resolved-only precision and counts are retained in `gradingResult.componentResults[].metadata.quality`. Review valid extras independently; an unmatched finding is not automatically false positive. Partial coverage keeps the full expected denominator.

Keep an all-planned-attempt ledger alongside eligible report grades. Delivery yield is eligible delivered matches / (planned attempts × expected count), assigning zero delivery to failed or invalid attempts while leaving their recall unscored. Include their duration and cost. See the [guide](https://www.promptfoo.dev/docs/guides/codex-security-results/) for the recorded comparison and limits.
