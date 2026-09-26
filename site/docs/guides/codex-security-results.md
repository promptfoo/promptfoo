---
title: Evaluate a vulnerability-finding harness
sidebar_label: Codex Security Harness Comparison
sidebar_position: 65
description: Compare Codex Security source reviews in Promptfoo using pinned source, curated expected findings, coverage, recorded model usage, and genuine saved reports.
---

# Evaluate a vulnerability-finding harness

Compare two Codex Security configurations on the same pinned source, then review their findings against independently curated ground truth. The consolidated example runs a standard source review with Luna and Terra at medium reasoning effort; a separate config imports genuine saved reports without repeating the operation. The example includes a recorded aggregate case study; supply your own reports when running import.

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

Keep this checkout clean; do not install or run Juice Shop. The config selects 14 files / 1,621 source lines at this revision. Both columns use `security-scan`, medium reasoning, the same prompt, a three-thread limit and a $5 estimated spend threshold per operation. The models are `gpt-5.6-luna` and `gpt-5.6-terra`. The threshold is not a hard billing cap.

The benchmark prompt explicitly includes intentional and documented vulnerabilities. Existing challenge labels are not grounds for excluding source-supported findings. Without this instruction, a reviewer may interpret deliberately vulnerable training code as outside the review's purpose.

```bash
npx promptfoo@latest eval --max-concurrency 1 --no-cache -o comparison-live.json
npx promptfoo@latest view
```

This starts two real SDK operations. The prompt limits the requested work to source inspection, including validation against source, with no application execution, exploit generation, or vulnerability reproduction. Prompt instructions do not enforce an execution sandbox. A source-supported finding is not proof of runtime exploitability.

Preserve the config, full native eval export and source snapshot evidence. Labels and configured effort record intent; actual session settings, SDK/plugin versions and usage support attribution. Missing observations remain unknown. The example runs one pair; repeated experiments also need a frozen run schedule and fresh-state policy.

To revisit results without rerunning operations, use the [README extraction snippet](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-codex-security#compare-saved-reports) to combine `response.metadata.codexSecurityReplay` with the original `response.raw` payload. Exported raw data can be a JSON string or object. Replay files preserve native normalized diagnostics and historical resources, including failures without a canonical report. Keep the full export as primary evidence. Direct SDK `ScanResult.toJSON()` files remain accepted, but SDK 0.1.31 omits runtime operation and recovery warnings.

## Prepare comparable reports

Use a Promptfoo replay file or the full JSON returned by SDK `ScanResult.toJSON()`, including its manifest, findings, and coverage. Keep the original files unchanged. Before interpreting differences, check:

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

On September 26, 2026, six planned standard source reviews compared Luna medium and Terra medium, three repeats each, on the pinned 14-file scope. The [aggregate receipt](https://github.com/promptfoo/promptfoo/blob/main/examples/openai-codex-security/benchmark-results.json) contains source-file and prompt hashes, frozen protocol/review identities, exact report hashes, settings and measurements. Raw reports and private SDK state are not bundled. Hashes identify preserved bytes, not an authenticated producer.

Independent AI source reviews froze **11 distinct applicable root causes** and four narrow negative controls before new outputs. This curated set is incomplete. At the pinned v19 revision, the catalog has 110 hacking challenges and 31 two-phase coding exercises (172 scoreboard tasks); those tasks are not a unique-vulnerability denominator. The [official coding-exercise documentation](https://help.owasp-juice.shop/appendix/code-snippets.html) explains the phases and source annotations. Valid extra findings can affect precision without enlarging the frozen recall denominator.

| Model / repeat | Delivered findings | Primary curated recall | Coverage / native warnings | Eligibility                       |
| -------------- | -----------------: | ---------------------- | -------------------------- | --------------------------------- |
| Luna / 1       |                 11 | 6/11                   | Complete / 0               | Eligible                          |
| Luna / 2       |        Unavailable | Not scored             | Unknown / 0                | Canonical publication failed      |
| Luna / 3       |                  7 | 6/11                   | Partial / 12               | Eligible                          |
| Terra / 1      |                  4 | 4/11                   | Complete / 0               | Eligible                          |
| Terra / 2      |                 11 | Not scored             | Complete / 0               | Excluded answer-file content read |
| Terra / 3      |                 12 | 8/11                   | Complete / 0               | Eligible                          |

The failed Luna attempt produced an invalid manifest and no canonical report. Its drafts do not count as delivered findings. The invalid Terra attempt exposed codefix/test content through broad searches; it receives no primary recall despite a separately retained content review. Both have zero delivery contribution, with time and cost retained. **Not scored is not measured zero recall.**

| Metric                                                      |             Luna medium |            Terra medium |
| ----------------------------------------------------------- | ----------------------: | ----------------------: |
| Eligible reports / planned attempts                         |                     2/3 |                     2/3 |
| Mean curated recall among eligible reports                  |                  54.55% |                  54.55% |
| Delivery yield over all planned attempts                    |          12/33 (36.36%) |          12/33 (36.36%) |
| Supported / refuted / unresolved eligible root-cause claims |              18 / 0 / 1 |              16 / 0 / 0 |
| Pooled eligible precision bounds                            |             94.74%–100% |               100%–100% |
| Total reported tokens, all attempts                         |               7,971,164 |               7,824,356 |
| Estimated USD range, all attempts                           | $0.32471884–$0.61524308 | $3.62291200–$6.74751200 |
| Mean outer CLI duration, all attempts                       |                229.86 s |                239.73 s |

The precision bounds include unresolved claims; they are not confidence intervals. Counts deduplicate control claims within each report, then pool across eligible repeats. One finding can contain multiple claims. The mean of per-report precision bounds differs from pooled precision: Luna's lower bound is 95.45% when averaged per report and 94.74% when pooling its 19 claims. No refuted core claim does not establish that every impact or precondition statement was correct.

Coverage and delivered artifacts exposed harness failures. Terra repeat 1's model repairs reduced malformed drafts to four canonical findings while broader coverage prose still said other surfaces were reported; SDK export and Promptfoo agreed on four. Luna repeat 3 retained seven findings with twelve schema-recovery warnings and partial coverage. Its expected denominator stayed 11. Complete coverage likewise did not guarantee full recall.

The frozen protocol used SDK 0.1.31/plugin 0.1.95, CLI 0.156.1, saved ChatGPT authentication, fresh state, sequential counterbalanced order, a three-thread cap and $5 estimated threshold per scan. All observed root/worker model and effort settings matched the request; this is trace evidence, not server-side model attestation. Tokens include repeated context and cached input. Costs are API-equivalent estimates, not subscription invoices; equal spend limits are not equal compute. The table's duration includes outer CLI overhead and is distinct from manifest scan duration.

This is known public code with inline vulnerability annotations, not an unseen-code benchmark. The reading restrictions were prompt instructions, not filesystem isolation; a trace audit determined the excluded attempt's invalidity. Two AI agents reviewed anonymous finding packets, but timing batches and accidental disclosure of Terra repeat 1 model/count metadata to one reviewer limited blinding. This was source review, not human validation or runtime reproduction. Three planned repeats and two eligible reports per model support descriptive observations, not a statistically established winner.

Six earlier setup failures occurred before any model session because of output-directory permissions. They remain a separate operational cohort. An earlier three-file pilot also showed why the prompt must explicitly include intentional flaws and require canonical finding schemas. Neither earlier cohort is pooled into these six model-backed attempts; no failed or invalid attempt was replaced to improve this table.

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

The portable [example helper](https://github.com/promptfoo/promptfoo/blob/main/examples/openai-codex-security/grade-benchmark.mjs) replaces inline graders. It consumes `context.config.benchmark`, normalized provider metadata and original SDK-shaped output. It does not discover findings or make adjudication decisions.

Prepare independently reviewed `benchmark.json` using the [README contract](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-codex-security#grade-independently-reviewed-findings). The frozen definition records revision, source snapshot and ground-truth hashes, included/excluded paths and unique expected IDs. Each imported file SHA maps to a hash-bound review of every current finding ID, with explicit protocol/provenance validity and source-evidenced claims. Stable root-cause IDs deduplicate repeated claims; report IDs are local identities, not benchmark labels. The helper's `evidenceHash` binds definition/review content, but cannot authenticate the reviewer or source.

Add the file assertion to the saved-report config:

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

The helper resolves relative benchmark file paths from its own directory; use an absolute path for evidence elsewhere. These reviews are grading inputs, not scan prompts. Do **not** set `metric:` on `gradeBenchmark`. It emits `CuratedRecall`, `PrecisionLower` and `PrecisionUpper` only when defined. Eligible zero-finding reports score zero recall; empty precision denominators remain undefined. Partial coverage keeps the full recall denominator. Missing/changed hashes, revision/scope mismatch, invalid protocol, unreviewed findings or an empty expected set return **Not scored**, null quality metadata and no quality named metrics. Promptfoo still records an overall failed evidence check with numeric score zero; that value is not a recall observation.

The helper's quality assertion passes only at full curated recall and a precision lower bound of one. The complete-coverage assertion is separate. Inspect `gradingResult.componentResults[].metadata.quality` for the eligibility reason, counts, matched IDs and precision bounds; use named metrics instead of the aggregate case score. Scope equality ignores path order and narrative wording; reviewers must still establish comparable assumptions and actual source snapshots.

For unique in-scope claims, let `S`, `F`, and `U` be supported, refuted and unresolved counts. Resolved-only precision is `S/(S+F)`; report uncertainty as `[S/(S+F+U), (S+U)/(S+F+U)]`. These are adjudication bounds. An unmatched but supported extra finding contributes to precision, not curated recall. Keep duplicates and unresolved cases visible.

Maintain a separate ledger of every planned attempt. **Eligible recall** averages only valid delivered reports. **All-planned delivery yield** is eligible delivered matches divided by `(planned attempts × expected count)`: failed/invalid attempts contribute zero delivery, while their recall stays unscored. Unlaunched planned attempts also stay in this denominator. Include failed and invalid effort in resource totals. A UI filtered to eligible imports cannot supply the all-attempt denominator.

## Inspect findings and coverage in Promptfoo

Open **Compare Codex Security source reviews** for the live config, or **Compare existing Codex Security reports** for the import config, and expand each column's output. The Codex Security summary marks imported reports and shows current finding counts, coverage, warnings, and available provenance before the raw report. The same versioned data is available in `response.metadata.codexSecurity`, including target, scope, and observed versions. Native runs have `source.kind: sdk`; imported reports have `source.kind: saved-report` and a file hash.

Use `findings.findings` for the current run. `repositoryFindings`, when present, can also include earlier open findings; do not count all of them as fresh discoveries. Review locations and evidence for disagreements. Zero findings with partial or unknown coverage does not establish that the source is free of vulnerabilities, and complete coverage does not prove their absence either.

Keep source and report references with your adjudications so another reviewer can check the mapping. Artifact paths refer to the original host and may no longer exist; importing JSON does not copy those artifacts.

## Separate original measurements from import overhead

Saved-report cost and duration are historical measurements from the original operation. Importing files incurs no new model usage. Generic file-loading latency is not scanner latency and should not be used to compare the harnesses.

Compare recorded durations only when their definitions match. The summary's `elapsedMs` comes from valid manifest start/end timestamps; it does not substitute a model-turn duration, which may cover different work. Preserve the measurement source and leave missing timestamps or usage unknown.

The SDK's `estimatedUsd` is a short-context baseline; use the recorded estimated range and pricing provenance when available. An unknown range maximum is not zero. These are API-equivalent estimates, not billing guarantees. Original scan budgets can be exceeded by in-flight requests, and post-scan work is outside scan cost tracking. See the [provider cost reference](/docs/providers/openai-codex-security#results-cost-and-assertions).

For repeated runs, retain every original report and apply the same adjudication policy. Keep source/settings differences visible, report unresolved cases, and avoid presenting a single pair of reports as a statistically reliable estimate of overall scanner quality.
