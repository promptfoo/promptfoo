---
title: Evaluate a vulnerability-finding harness
sidebar_label: Codex Security Harness Comparison
sidebar_position: 65
description: Compare Codex Security source reviews in Promptfoo using pinned source, curated expected findings, coverage, recorded model usage, and genuine saved reports.
---

# Evaluate a vulnerability-finding harness

Compare two Codex Security configurations on the same pinned source, then review their findings against independently curated ground truth. The consolidated example runs a standard source review at low and medium reasoning effort; a separate config imports genuine saved reports without repeating the operation. The example includes a recorded aggregate case study; supply your own reports when running import.

Use this workflow to answer a specific question, such as which run identifies more of your independently confirmed expected findings. Completion and coverage checks alone do not measure detection quality.

## Run a bounded source-review comparison

Initialize the [example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-codex-security), install the SDK alongside Promptfoo, and configure [native-operation authentication](/docs/providers/openai-codex-security#installation-and-authentication):

```bash
npx promptfoo@latest init --example openai-codex-security
cd openai-codex-security
npm install promptfoo @openai/codex-security@^0.1.31
git clone --branch v19.0.0 --single-branch https://github.com/juice-shop/juice-shop.git juice-shop-v19
git -C juice-shop-v19 checkout --detach 36870cbbdfe7864698e1adf644c7bf772f67ebb7
export CODEX_SECURITY_REPOSITORY="$PWD/juice-shop-v19"
```

Keep this checkout clean; do not install or run Juice Shop. The config scopes both columns to `routes/basket.ts`, `routes/delivery.ts`, and `routes/orderHistory.ts`, totaling 123 source lines at this revision. Both use `security-scan`, `gpt-5.6-luna`, the same prompt, and a $3 estimated spend threshold per scan. The requested reasoning effort is `low` in one column and `medium` in the other. This threshold is not a hard billing cap.

The benchmark prompt explicitly includes intentional and documented vulnerabilities. Existing challenge labels are not grounds for excluding source-supported findings. Without this instruction, a reviewer may interpret deliberately vulnerable training code as outside the review's purpose.

```bash
npx promptfoo@latest eval --max-concurrency 1 --no-cache -o comparison-live.json
npx promptfoo@latest view
```

This starts two real SDK operations. The prompt limits the requested work to source inspection, including validation against source, with no application execution, exploit generation, or vulnerability reproduction. Prompt instructions do not enforce an execution sandbox. A source-supported finding is not proof of runtime exploitability.

Preserve the config, original SDK reports, and evidence of the actual source snapshot. Labels and configured effort record intent; check the observed model, effective settings when available, SDK/plugin versions, and reported usage before attributing a difference to effort. The normalized summary does not supply a verified reasoning-effort field. Missing observations remain unknown. To revisit results without rerunning the operations, extract each SDK report into an individual JSON file and use the saved-report config below. Exported `response.raw` may be a JSON string or an object; the [README extraction snippet](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-codex-security#compare-saved-reports) handles both forms and checks the manifest document type before saving.

## Prepare comparable reports

Use the full JSON returned by SDK `ScanResult.toJSON()`, including its manifest, findings, and coverage. Keep the original files unchanged. Before interpreting differences, check:

| Evidence        | What to compare                                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Source identity | Repository plus exact revision, diff base/head, or snapshot digest; the same Git commit alone is insufficient for dirty worktrees. |
| Scope           | Included/excluded paths, assumptions, and expected findings applicable to that scope.                                              |
| Run identity    | Scan ID, report file hash, recorded model/settings, and available SDK/plugin versions.                                             |
| Completion      | Scan status, coverage completeness, deferred surfaces, and warnings.                                                               |
| Measurement     | Source and definition of recorded duration and estimated cost.                                                                     |

If revision or scope differs, explain that difference before scoring; it may account for a missing finding. Missing provenance remains unknown. Loading a report does not independently verify that it came from the claimed source.

### Using existing Juice Shop reports

[OWASP Juice Shop](https://owasp.org/projects/juice-shop) is an intentionally insecure application used for training and security-tool assessment. The live example pins the [official repository](https://github.com/juice-shop/juice-shop) at v19.0.0, commit `36870cbbdfe7864698e1adf644c7bf772f67ebb7`. When using existing reports, require matching source snapshots, configuration, and review scope.

Build a curated expected set for that revision from independently reviewed evidence. The official [challenge declaration reference](https://pwning.owasp-juice.shop/companion-guide/latest/part4/integration.html#challenge-declaration-file) documents challenge keys and environment-dependent availability. A challenge key can be an evidence reference; it is not automatically one source-code finding or a suitable recall denominator. Record the affected source locations, applicability, and matching criteria for each expected ID. Preserve the revision-specific references rather than relying on a changing challenge count or treating scoreboard completion as source-review recall.

## Import two reports

If you only need saved-report comparison, initialize the same example; SDK installation and model credentials are unnecessary for import:

```bash
npx promptfoo@latest init --example openai-codex-security
cd openai-codex-security
```

Set `CODEX_SECURITY_BASELINE_REPORT` and `CODEX_SECURITY_CANDIDATE_REPORT` in the process environment to the absolute paths of your existing JSON reports. The `promptfooconfig.reports.yaml` provider columns are:

```yaml
providers:
  - id: openai:codex-security
    label: Baseline report
    config:
      report_file: '{{env.CODEX_SECURITY_BASELINE_REPORT}}'
  - id: openai:codex-security
    label: Candidate report
    config:
      report_file: '{{env.CODEX_SECURITY_CANDIDATE_REPORT}}'
```

Then import and evaluate the files:

```bash
npx promptfoo@latest eval -c promptfooconfig.reports.yaml --no-cache -o comparison-reports.json
npx promptfoo@latest view
```

`report_file` reads a saved report without starting a scan or making model calls. Missing files and invalid reports produce errors rather than triggering a native operation. The [example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-codex-security) supplies two checks: **CompletedScan** requires normalized `status === 'completed'`, and **CompleteCoverage** requires `coverage.completeness === 'complete'`. The provider already validates the report structure.

Those checks give you a starting comparison table; add the curated-recall assertion below after preparing adjudications. Inspect each row's exported `success`, `score`, `error`, and `response.metadata`; a successful process exit does not replace per-result review.

## Recorded Juice Shop comparison

On September 26, 2026, three standard source reviews used the pinned revision and 123-line scope above: `gpt-5.6-luna` at low and medium effort, plus `gpt-5.6-terra` at medium effort as a reference. The [aggregate receipt](https://github.com/promptfoo/promptfoo/blob/main/examples/openai-codex-security/benchmark-results.json) contains exact report hashes, source snapshot and prompt hashes, versions, and measurements. Raw reports and traces are not bundled; hashes identify the preserved report bytes, not their authenticity.

The two expected issues were independently reviewed before these measured runs: basket ownership isolation and an order-history ownership key based on a lossy email representation. Supporting routing and authentication code supplied negative controls: public delivery-method reads are not private order access, and accounting handlers must be assessed with their role middleware. Findings were adjudicated by source inspection, without runtime reproduction or independent severity scoring.

| Run          | Supported / refuted findings | Curated recall | Reviewed precision | Coverage (SDK warnings) |
| ------------ | ---------------------------- | -------------- | ------------------ | ----------------------- |
| Luna low     | 1 / 2                        | 1/2            | 1/3                | Partial (2)             |
| Luna medium  | 1 / 0                        | 1/2            | 1/1                | Partial (5)             |
| Terra medium | 2 / 0                        | 1/2            | 2/2                | Complete (0)            |

All three found the basket ownership issue and missed the curated order-identity issue. Luna low's two additional findings were conditional concerns about missing inline authorization; reviewing the accounting middleware resolved those concerns against the full application. Terra's additional session-expiration finding was source-supported, but it is a different issue from the missing order-identity finding. It counts toward precision without changing the frozen recall denominator. No current findings remained unreviewed or were classified as duplicates.

Both Luna reports retained findings but marked coverage partial with SDK schema-recovery warnings. Those warnings do not by themselves establish that selected files went unread, and the **CompleteCoverage** assertion still fails. Terra's complete coverage likewise did not prevent a miss against the curated set.

| Run          | Recorded scan duration | Reported total tokens | Estimated USD range     |
| ------------ | ---------------------- | --------------------- | ----------------------- |
| Luna low     | 69.547 s               | 642,254               | $0.03278948–$0.06203956 |
| Luna medium  | 134.792 s              | 1,368,934             | $0.05560496–$0.10600792 |
| Terra medium | 166.533 s              | 1,423,837             | $0.80218720–$1.50566840 |

These runs used SDK 0.1.31/plugin 0.1.95, separate fresh SDK state, saved ChatGPT authentication, a three-thread limit, and a $3 estimated threshold per scan. Workbench recipes and every recorded session's settings agreed on model and effort; session token totals matched SDK usage. These records establish execution settings, not server-side model attestation. Raw SDK reports lack a structured effort field. Duration comes from manifest timestamps; tokens include repeated context and cached input. Costs are API-equivalent SDK estimates, not measured subscription charges.

The Luna runs overlapped and Terra ran afterward. The portable example's command instead runs sequentially and leaves authentication/thread limits at SDK defaults. One run per configuration cannot establish a reliable model ranking or isolate cache and concurrency effects.

An earlier completed pair lacked explicit intentional-vulnerability benchmark framing: one malformed finding was discarded, and another run excluded a documented challenge. The measured prompt explicitly includes intentional flaws and requests the canonical finding schema. Keep unsuccessful attempts as harness QA evidence; do not mix that earlier prompt into the table above.

## Define ground truth before measuring quality

Before examining candidate outputs, freeze a curated set of independently confirmed findings that apply to the chosen revision and scope. Give each an expected finding ID, affected source location, matching criteria, and an evidence reference. These benchmark IDs should be stable across runs; do not assume the scanner's finding or occurrence IDs will be identical in both reports.

Review source locations, security properties, and required preconditions without treating runtime exploitability as established by source inspection alone. Review the current findings in each report and record a mapping from report finding IDs to expected IDs. Label additional reported findings as confirmed, false positive, duplicate, or unreviewed based on evidence. An unmatched finding may be a valid discovery missing from your benchmark; it is not automatically a false positive. Title-keyword matches alone are insufficient adjudication.

After those labels exist, distinguish the metrics you intend to compare:

| Metric             | Definition and limits                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Curated-set recall | Unique expected IDs found / all known in-scope expected IDs. This measures recall on your curated set, not all vulnerabilities in the repository.                                                            |
| Reviewed precision | True positives / (true positives + false positives), after applying a consistent duplicate policy. Report the unreviewed count alongside it; omitting unresolved findings can make this estimate optimistic. |
| Duplicates         | Separately count repeated reports of the same underlying issue; repeated matches must not increase recall.                                                                                                   |
| Coverage           | Record complete, partial, or unknown, together with deferred work and exclusions.                                                                                                                            |

Keep missing expected findings in the recall denominator when coverage is partial; otherwise, a smaller review scope could misleadingly improve the score. Display the coverage limitation alongside the misses. If ground truth, revision, or scope is not established, leave the quality comparison unscored rather than inventing a denominator. A zero denominator is undefined, not a perfect score.

The included configuration checks completion and coverage. SDK `failure_severity` records a threshold; it does not create a Promptfoo assertion or establish recall/precision.

### Add a curated-recall assertion

This assertion is for the saved-report config, after independent adjudication; it does not score live calls directly. For repository reports with a recorded revision and scope, put a `benchmark` object in the common test row's `vars`. Supply real adjudications for both imported file hashes. If a report records only a snapshot digest, this revision-based assertion cannot score it; retain the digest and establish matching source identity before adapting the check:

| Field           | Required value                                                                                                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `revision`      | The exact revision reviewed when curating the expected set. Confirm source identity and a clean snapshot separately.                                                                                           |
| `scope`         | An object with known `includePaths` and `excludePaths` arrays of unique, nonempty strings, including explicit empty arrays. Review narrative assumptions and limitations separately.                           |
| `expectedIds`   | A nonempty array of unique, stable curated IDs. Keep their source/evidence references with the benchmark.                                                                                                      |
| `adjudications` | An object keyed by imported report SHA-256, then current SDK `findingId`. Each entry is `{ expectedIds: string[], evidence: string }`. An empty ID array means reviewed with no curated match, not unreviewed. |

Append this [JavaScript assertion](/docs/configuration/expected-outputs/javascript#using-test-context) to the row's `assert` list. It uses `context.vars.benchmark` and `context.metadata.codexSecurity`. Keep the original JSON output without an output transform for this assertion:

```yaml
- type: javascript
  metric: CuratedRecall
  value: |
    const result = context.metadata?.codexSecurity;
    const benchmark = context.vars.benchmark;
    const requireEvidence = (condition, reason) => {
      if (!condition) throw new Error(`Recall not computed: ${reason}`);
    };
    const uniqueIds = (ids) => Array.isArray(ids)
      && ids.every(id => typeof id === 'string' && id.trim().length > 0)
      && new Set(ids).size === ids.length;
    const scopeKey = (scope) => JSON.stringify([
      [...scope.includePaths].sort(), [...scope.excludePaths].sort(),
    ]);
    requireEvidence(result?.version === 1 && result.source.kind === 'saved-report'
      && !result.source.mocked && result.status === 'completed', 'need a completed saved scan');
    requireEvidence(typeof benchmark?.revision === 'string' && benchmark.revision.length > 0
      && result.target?.revision === benchmark.revision, 'revision missing or mismatched');
    requireEvidence([benchmark.scope, result.scope].every(scope => scope
      && uniqueIds(scope.includePaths) && uniqueIds(scope.excludePaths))
      && scopeKey(benchmark.scope) === scopeKey(result.scope), 'scope missing or mismatched');
    requireEvidence(uniqueIds(benchmark.expectedIds) && benchmark.expectedIds.length > 0,
      'expected IDs must be unique and nonempty; zero denominator is undefined');
    const expected = new Set(benchmark.expectedIds);
    const findings = JSON.parse(output).findings?.findings;
    const reportIds = findings?.map(finding => finding.findingId);
    requireEvidence(uniqueIds(reportIds), 'current finding IDs missing or duplicated');
    const review = benchmark.adjudications?.[result.source.sha256];
    requireEvidence(review && typeof review === 'object' && !Array.isArray(review)
      && Object.keys(review).length === reportIds.length
      && reportIds.every(id => Object.hasOwn(review, id)), 'adjudicate every current finding');
    const matched = new Set();
    for (const id of reportIds) {
      const item = review[id];
      requireEvidence(uniqueIds(item?.expectedIds)
        && item.expectedIds.every(expectedId => expected.has(expectedId))
        && typeof item.evidence === 'string' && item.evidence.trim().length > 0,
        `invalid or unsupported adjudication for ${id}`);
      item.expectedIds.forEach(expectedId => matched.add(expectedId));
    }
    return {
      pass: matched.size === expected.size,
      score: matched.size / expected.size,
      reason: `${matched.size}/${expected.size} curated IDs found; coverage ${result.coverage.completeness}`,
    };
```

The pass condition requires every expected ID; the score is curated-set recall. Repeated matches count once, and partial coverage does not shrink the denominator. Scope comparison ignores path ordering and narrative wording. Review summaries, assumptions, and limitations separately to establish comparability; this check does not authenticate the source or a reviewer’s judgment. Missing revision/scope, incomplete adjudication, invalid IDs, or an empty expected set fail with **Recall not computed**. Promptfoo assigns thrown assertion errors a score of zero; exclude these precondition failures from recall summaries rather than interpreting that failure score as measured recall. This assertion does not calculate precision or verify a reviewer's evidence automatically.

## Inspect findings and coverage in Promptfoo

Open **Compare Codex Security source review effort** for the live config, or **Compare existing Codex Security reports** for the import config, and expand each column's output. The Codex Security summary marks imported reports and shows current finding counts, coverage, warnings, and available provenance before the raw report. The same versioned data is available in `response.metadata.codexSecurity`, including target, scope, and observed versions. Native runs have `source.kind: sdk`; imported reports have `source.kind: saved-report` and a file hash.

Use `findings.findings` for the current run. `repositoryFindings`, when present, can also include earlier open findings; do not count all of them as fresh discoveries. Review locations and evidence for disagreements. Zero findings with partial or unknown coverage does not establish that the source is free of vulnerabilities, and complete coverage does not prove their absence either.

Keep source and report references with your adjudications so another reviewer can check the mapping. Artifact paths refer to the original host and may no longer exist; importing JSON does not copy those artifacts.

## Separate original measurements from import overhead

Saved-report cost and duration are historical measurements from the original operation. Importing files incurs no new model usage. Generic file-loading latency is not scanner latency and should not be used to compare the harnesses.

Compare recorded durations only when their definitions match. The summary's `elapsedMs` comes from valid manifest start/end timestamps; it does not substitute a model-turn duration, which may cover different work. Preserve the measurement source and leave missing timestamps or usage unknown.

The SDK's `estimatedUsd` is a short-context baseline; use the recorded estimated range and pricing provenance when available. An unknown range maximum is not zero. These are API-equivalent estimates, not billing guarantees. Original scan budgets can be exceeded by in-flight requests, and post-scan work is outside scan cost tracking. See the [provider cost reference](/docs/providers/openai-codex-security#results-cost-and-assertions).

For repeated runs, retain every original report and apply the same adjudication policy. Keep source/settings differences visible, report unresolved cases, and avoid presenting a single pair of reports as a statistically reliable estimate of overall scanner quality.
