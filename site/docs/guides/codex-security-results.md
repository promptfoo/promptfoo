---
title: Evaluate a vulnerability-finding harness
sidebar_label: Codex Security Report Comparisons
sidebar_position: 65
description: Compare existing Codex Security reports in Promptfoo using source provenance, curated expected findings, coverage, and recorded scan cost and duration metrics.
---

# Evaluate a vulnerability-finding harness

Compare the evidence produced by two completed Codex Security runs in Promptfoo. Each column imports an existing report, so the comparison can use real findings without repeating the original operation. You supply the reports and ground truth; this guide includes no prewritten findings or claimed benchmark results.

Use this workflow to answer a specific question about two runs on the same source, such as which report contains more of your independently confirmed expected findings. Report import and contract checks alone do not measure detection quality.

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

[OWASP Juice Shop](https://owasp.org/projects/juice-shop) is an intentionally insecure application used for training and security-tool assessment. For this comparison, use reports already produced against the same pinned commit of the [official repository](https://github.com/juice-shop/juice-shop), with matching source snapshots, configuration, and review scope.

Build a curated expected set for that revision from independently reviewed evidence. The official [challenge declaration reference](https://pwning.owasp-juice.shop/companion-guide/latest/part4/integration.html#challenge-declaration-file) documents challenge keys and environment-dependent availability. A challenge key can be an evidence reference; it is not automatically one source-code finding or a suitable recall denominator. Record the affected source locations, applicability, and matching criteria for each expected ID. Preserve the revision-specific references rather than relying on a changing challenge count or treating scoreboard completion as source-review recall.

## Import two reports

Initialize the consolidated example:

```bash
npx promptfoo@latest init --example openai-codex-security
cd openai-codex-security
```

Set `CODEX_SECURITY_BASELINE_REPORT` and `CODEX_SECURITY_CANDIDATE_REPORT` in the process environment to the absolute paths of your existing JSON reports. The example's two provider columns are:

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
npx promptfoo@latest eval --no-cache -o comparison.json
npx promptfoo@latest view
```

`report_file` reads a saved report without starting a scan or making model calls. Missing files and invalid reports produce errors rather than triggering a native operation. The [example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-codex-security) supplies two checks: **CompletedScan** requires normalized `status === 'completed'`, and **CompleteCoverage** requires `coverage.completeness === 'complete'`. The provider already validates the report structure.

Those checks give you a starting comparison table; add the curated-recall assertion below after preparing adjudications. Inspect each row's exported `success`, `score`, `error`, and `response.metadata`; a successful process exit does not replace per-result review.

## Define ground truth before measuring quality

Create a curated set of independently confirmed findings that apply to the chosen revision and scope. Give each an expected finding ID, affected source location, matching criteria, and an evidence reference. These benchmark IDs should be stable across runs; do not assume the scanner's finding or occurrence IDs will be identical in both reports.

Review the current findings in each report and record a mapping from report finding IDs to expected IDs. Label additional reported findings as confirmed, false positive, duplicate, or unreviewed based on evidence. An unmatched finding may be a valid discovery missing from your benchmark; it is not automatically a false positive. Title-keyword matches alone are insufficient adjudication.

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

For repository reports with a recorded revision and scope, put a `benchmark` object in the common test row's `vars`. Supply real adjudications for both imported file hashes:

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

Open **Compare existing Codex Security reports** in the results list and expand each column's output. The Codex Security summary marks imported reports and shows current finding counts, coverage, warnings, and available provenance before the raw report. The same versioned data is available in `response.metadata.codexSecurity`, including `source.kind: saved-report`, the file hash, target, scope, and observed versions.

Use `findings.findings` for the current run. `repositoryFindings`, when present, can also include earlier open findings; do not count all of them as fresh discoveries. Review locations and evidence for disagreements. Zero findings with partial or unknown coverage does not establish that the source is free of vulnerabilities, and complete coverage does not prove their absence either.

Keep source and report references with your adjudications so another reviewer can check the mapping. Artifact paths refer to the original host and may no longer exist; importing JSON does not copy those artifacts.

## Separate original measurements from import overhead

Saved-report cost and duration are historical measurements from the original operation. Importing files incurs no new model usage. Generic file-loading latency is not scanner latency and should not be used to compare the harnesses.

Compare recorded durations only when their definitions match. The summary's `elapsedMs` comes from valid manifest start/end timestamps; it does not substitute a model-turn duration, which may cover different work. Preserve the measurement source and leave missing timestamps or usage unknown.

The SDK's `estimatedUsd` is a short-context baseline; use the recorded estimated range and pricing provenance when available. An unknown range maximum is not zero. These are API-equivalent estimates, not billing guarantees. Original scan budgets can be exceeded by in-flight requests, and post-scan work is outside scan cost tracking. See the [provider cost reference](/docs/providers/openai-codex-security#results-cost-and-assertions).

For repeated runs, retain every original report and apply the same adjudication policy. Keep source/settings differences visible, report unresolved cases, and avoid presenting a single pair of reports as a statistically reliable estimate of overall scanner quality.
