---
title: Understand Codex Security results
sidebar_label: Codex Security Results
sidebar_position: 65
description: Learn to read Codex Security findings, coverage, validation outcomes, and estimated costs in Promptfoo using portable synthetic fixtures without model calls.
---

# Understand Codex Security results

Use this guide to check how Promptfoo presents Codex Security results and to decide what your assertions should measure. The walkthrough uses synthetic responses: it needs no model credentials, Codex Security SDK, Python, or target repository.

For native provider installation and configuration, see the [Codex Security provider reference](/docs/providers/openai-codex-security).

## Understand the mapping

The native provider wraps a whole security operation in each provider call. A provider column represents one model/configuration, a test row supplies an input such as a repository or candidate finding, and the prompt provides additional instructions. Each prompt/provider/test/repeat combination starts a separate operation.

Promptfoo maps standard, deep, Git diff, and finding-validation operations. Other SDK and plugin workflows, such as remediation and fix verification, are separate. Assertions decide whether an eval passes; a completed operation does not automatically establish that its repository is secure.

## Run the synthetic example

Install the example and export its results:

```bash
npx promptfoo@latest init --example openai-codex-security-results
cd openai-codex-security-results
npx promptfoo@latest eval --no-cache -o results.json
```

The [example files](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-codex-security-results) contain a custom provider and four hand-authored responses. The provider returns minimal result shapes without loading the native SDK. They are presentation fixtures, not sealed scan artifacts, and none of the findings describes a real vulnerability.

The run deliberately includes assertion failures and a provider error. A nonzero exit status is expected under the default pass threshold. Open `results.json` and inspect each row's `success`, `score`, `error`, and `response.metadata`:

| Synthetic case                  | Expected outcome  | What it demonstrates                                                                |
| ------------------------------- | ----------------- | ----------------------------------------------------------------------------------- |
| Complete coverage               | Pass              | A passing coverage assertion can coexist with an informational placeholder finding. |
| Partial coverage, zero findings | Assertion failure | No findings is insufficient when review coverage is incomplete.                     |
| Deferred validation             | Assertion failure | A completed validation can still lack enough evidence to report a finding.          |
| Execution error                 | Provider error    | An unsuccessful operation must remain distinguishable from a completed result.      |

The coverage cases use these assertions:

```yaml
assert:
  - type: is-json
  - type: javascript
    metric: CompleteCoverage
    value: JSON.parse(output).coverage.completeness === 'complete'
```

The validation case checks `JSON.parse(output).disposition === 'reportable'`. Its synthetic `deferred` response intentionally fails that rule. Neither assertion measures vulnerability detection quality.

## Inspect results in the web UI

Open the viewer after the eval:

```bash
npx promptfoo@latest view
```

Choose the eval named **Synthetic Codex Security result presentation** and expand a result. The Codex Security summary shows coverage or validation disposition, current findings, warnings, and estimated spend before the raw output. These fixtures are marked as synthetic. Their SDK/plugin versions and artifact paths are absent because no SDK execution or artifact generation occurred.

Inspect the partial case alongside the complete case. It has zero current findings but incomplete coverage and a warning. Then inspect deferred validation: its cost is unreported. The scan fixtures contain synthetic zero-cost estimates; neither those values nor replay latency represents a real operation.

Use the raw output and metadata for the complete structured response. For real results, artifact paths refer to the machine that ran the operation; copying a path does not download its contents.

## Read coverage and findings separately

`findings.findings` contains findings from the current scan. `repositoryFindings`, when present, can also include earlier open findings. Counting both as fresh discoveries can distort a comparison.

Coverage completeness is `complete`, `partial`, or `unknown`. Read deferred work, exclusions, and open questions as well as the label. Complete coverage does not establish the absence of vulnerabilities. In a synthetic fixture, the label makes no claim about source review at all.

Validation returns `reportable`, `suppressed`, `not_applicable`, or `deferred`. Keep those distinctions in your assertions and review the accompanying report. In particular, `deferred` is not a conclusion that the candidate is harmless.

SDK `failure_severity` records a policy threshold; it does not create a Promptfoo assertion. Decide whether the eval is testing expected finding recall, checking a severity gate, or validating a presentation contract, then author the appropriate assertions. These have different pass conditions.

The provider reference includes a keyword-matching example for finding recall. Treat it as a starter heuristic: title wording can vary, and a passing mention can match a keyword. A detection-quality benchmark needs curated expected cases, structured matching criteria, false-positive review, coverage accounting, and repeated runs. This synthetic walkthrough measures none of those qualities.

## Interpret estimated spend

The native provider's `cost` is the SDK's short-context baseline estimate. When available, `metadata.cost` and the raw scan result also contain `estimatedUsdRange` and pricing provenance. An unavailable range maximum means the SDK cannot provide an upper estimate, not that the maximum is zero.

`max_cost_usd` is an estimated stopping threshold for each scan. In-flight requests may finish above it, and post-scan prompts run after cost tracking ends, outside that limit. Multiplying providers, rows, prompts, or repeats also multiplies the operations receiving that budget. These are API-equivalent model-spend estimates, not a guarantee about subscription billing. See the [SDK cost documentation](https://learn.chatgpt.com/docs/security/sdk#set-a-scan-budget).

Finding validation does not currently report reliable token or cost totals. Leave these unknown; a cost assertion requires a reported estimate. Similarly, `cacheWriteInputTokensReported: false` means a numeric cache-write subtotal is incomplete, even if it is zero.

## Check native setup separately

Synthetic replay checks presentation, assertions, and result persistence. It does not verify authentication, model access, runtime startup, native operation behavior, or detection accuracy.

For native operation setup, install Promptfoo and the SDK together and satisfy both Node and Python requirements in the [provider reference](/docs/providers/openai-codex-security#installation-and-authentication). Repository and artifact paths belong to the server's filesystem. Credentials must be available to the server/CLI process; the generic Setup API keys dialog cannot override the native provider's credentials.

**Check setup** in the provider form uses SDK preflight without starting a scan or grading results remotely. It checks concrete paths and configuration. It does not establish that Python/runtime startup, credentials, account permissions, or model access will work. Validation setup checks directories and any finding file's presence, not whether the finding is valid. Supply concrete values when configuration normally comes from row variables.

## Keep comparisons reproducible

Record the source revision, operation, explicit model/effort/settings, SDK and plugin versions, initial SDK history state, assertions, and exported per-row results. Give provider configurations descriptive labels so same-model comparisons remain distinguishable.

For repeatable QA, retain fixtures for complete, partial, unknown, deferred, and failed outcomes. Keep synthetic identifiers visible, use `--no-cache` for fresh provider execution, and separate synthetic results from real scan evidence. Review source-bearing findings and artifacts before sharing them.
