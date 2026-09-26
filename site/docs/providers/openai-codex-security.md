---
sidebar_position: 43
sidebar_label: Codex Security SDK
title: OpenAI Codex Security SDK
description: Compare Codex Security scans and finding validation in Promptfoo with clear repository coverage, model reasoning, token usage, and estimated cost reporting.
---

# OpenAI Codex Security SDK

The Codex Security provider runs the `@openai/codex-security` SDK directly as a Promptfoo provider, or imports an existing SDK report with `report_file`. Use it to compare standard and deep scans, models, reasoning effort, vulnerability recall, finding validation, token usage, and estimated scan cost.

| Provider                                         | Best for                                                        | Provider ID                     |
| ------------------------------------------------ | --------------------------------------------------------------- | ------------------------------- |
| Codex Security SDK                               | Repository security scans, validated findings, and coverage     | `openai:codex-security:<model>` |
| [Codex SDK](./openai-codex-sdk.md)               | General coding-agent tasks, local skills, and structured output | `openai:codex-sdk`              |
| [Codex App Server](./openai-codex-app-server.md) | Rich-client protocol events, approvals, and thread lifecycle    | `openai:codex-app-server`       |
| [OpenAI Agents](./openai-agents.md)              | Application agents, tools, handoffs, and sessions               | `openai:agents:<agent>`         |

## Installation and authentication

Promptfoo declares the SDK as an optional dependency. If optional dependencies were omitted, install Promptfoo and the SDK together so they share the same installation:

```bash
npm install promptfoo @openai/codex-security@^0.1.18
```

Native operations require `@openai/codex-security` version `0.1.18` or newer. Older SDK releases omit finding validation and can undercount deep-worker token usage and cost. The `^0.1.18` installation range also permits newer `0.1.x` releases. Use Node.js `^22.22.0`, `^24.0.0`, or `^26.0.0`, plus Python 3.10 or later. Python 3.10 also requires `tomli`; use `python_path` to select an interpreter when needed.

Promptfoo loads the SDK from its own installation; it does not execute SDK packages found in the target repository or eval directory. For a global installation, install both packages together with `npm install -g promptfoo @openai/codex-security@^0.1.18`.

Use a supported saved Codex/ChatGPT login, or set `OPENAI_API_KEY` or `CODEX_API_KEY` before starting the Promptfoo server or CLI. Credentials belong to that process: the Setup API keys dialog and provider-scoped environment overrides cannot supply a different key to this provider. With `auth: auto`, the SDK prefers an environment API key when both a key and a saved login are available. Set `auth: chatgpt` to select the saved login, or `auth: api-key` to require an environment key. See the [SDK authentication documentation](https://learn.chatgpt.com/docs/security/sdk#configure-the-runtime-and-credentials).

Codex Security access, Trusted Access, and model availability depend on the authenticated account and organization.

## Configure in the web UI

Open **Setup**, select **Add Provider**, and search for **Codex Security SDK** or **security**. The provider is listed under **Agent Frameworks** and uses the native `openai:codex-security:<model>` provider ID rather than a Python adapter.

Set **Result source** to **Saved report** to import existing evidence. Enter an absolute server-side path in **Report file**; no SDK installation or model credentials are needed. **Check setup** validates the file locally.

For **SDK operation**, choose a security operation, repository path, model, reasoning effort, authentication method, and optional estimated scan budget. Set **Provider label** to distinguish comparisons. Repository paths refer to the server's filesystem, which may differ from the browser's machine; **Use repository from test cases** inserts `{{repository}}` for row-specific paths. Configure advanced deep-scan workers, subagents, discovery limits, and runtime limits in YAML when needed.

For native operations, **Check setup** uses SDK preflight without starting an operation or sending results to a remote grader. It checks concrete configuration and paths, but does not verify Python/runtime startup, credentials, account permissions, or model availability. For validation, it checks directories and any finding file's presence, not the candidate's validity. Resolve row-variable templates to concrete values before checking setup. Older SDK releases without preflight support report that limitation.

For native execution, each prompt/provider/test/repeat combination runs a whole operation. Use descriptive provider labels when comparing settings, and account for that multiplication when planning runtime and spend. To compare existing reports without repeating their original operations, see [Evaluate a vulnerability-finding harness](/docs/guides/codex-security-results).

## Compare scan depth, models, and reasoning

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Compare Codex Security scan depth and reasoning
prompts:
  - Find exploitable authorization, injection, and sensitive-data vulnerabilities.
providers:
  - id: openai:codex-security:gpt-5.6-terra
    label: standard-terra-medium
    config:
      operation: security-scan
      repository: ./repository
      model_reasoning_effort: medium
      max_cost_usd: 1

  - id: openai:codex-security:gpt-5.6-sol
    label: standard-sol-high
    config:
      operation: security-scan
      repository: ./repository
      model_reasoning_effort: high
      max_cost_usd: 1

  - id: openai:codex-security:gpt-5.6-sol
    label: deep-sol-high
    config:
      operation: deep-security-scan
      repository: ./repository
      model_reasoning_effort: high
      workers: 2
      max_discovery_runs: 4
      max_cost_usd: 2

defaultTest:
  assert:
    - type: is-json
    - type: javascript
      value: |
        const scan = JSON.parse(output);
        return Array.isArray(scan.findings?.findings);

tests:
  - description: Compare the same repository and security objective
    vars: {}
```

Provider IDs support both `openai:codex-security` with `config.model` and `openai:codex-security:<model>`. Relative repository, output, plugin, finding, and knowledge-base paths resolve from the config file directory.

Run the config without cached results:

```bash
npx promptfoo eval -c promptfooconfig.yaml --no-cache
npx promptfoo view
```

The [included example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-codex-security) compares two reports you supply through `report_file`. It imports existing evidence and does not launch the operations shown above.

## Import existing reports

Set `report_file` to an existing regular JSON file no larger than 64 MiB containing SDK `ScanResult.toJSON()` output or a direct finding-validation result. Scan imports require manifest, findings, and coverage documents with matching scan IDs. Entire Promptfoo eval exports and standalone `findings.json` files are not accepted. The [consolidated example](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-codex-security) imports baseline and candidate reports into separate columns. It requires reports you supply; no sample findings are bundled.

Import reads saved evidence without starting a scan or calling a model, and requires no SDK installation, Python, or model credentials. `report_file` takes precedence over live-operation options; those options are unused during import, but the provider configuration must still be schema-valid. Relative report paths resolve from the config file directory. Path templates resolve during evaluation; **Check setup** requires a concrete report path. Missing or invalid reports and explicit mock markers produce provider errors, not a fallback scan. Check repository revision, scope, and original provenance before treating two reports as comparable; importing a file does not authenticate its contents.

The summary marks saved-report results and presents their original cost and duration as historical measurements. Those values are not new model usage or file-import latency. Imported scan operations remain unknown unless the report records `operation`; coverage mode alone does not establish which operation ran. See [Evaluate a vulnerability-finding harness](/docs/guides/codex-security-results) for curated expected IDs and the distinction between coverage checks and finding-quality metrics.

## Supported operations

The `operation` value matches the corresponding Codex Security skill name exactly.

| Operation            | Execution path                               | Purpose                                                                                       |
| -------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `security-scan`      | Native SDK: `run(..., { mode: 'standard' })` | Single-pass repository or scoped-path scan. Default operation.                                |
| `deep-security-scan` | Native SDK: `run(..., { mode: 'deep' })`     | Repeated discovery and validation with worker and stopping controls.                          |
| `security-diff-scan` | Native SDK: `run()` with `DiffTarget`        | Scan a committed Git diff or the working tree.                                                |
| `validation`         | Native SDK: `validate()`                     | Determine whether a candidate finding is reportable, suppressed, not applicable, or deferred. |

All four operations use the native SDK, which bootstraps its bundled security plugin automatically. Remediation, fix verification, and standalone delegated security skills are not supported by this provider.

## Scope repository and diff scans

Scan selected paths:

```yaml
providers:
  - id: openai:codex-security
    config:
      operation: security-scan
      repository: ./service
      paths:
        - src/auth
        - src/api
```

Review changes between committed refs:

```yaml
providers:
  - id: openai:codex-security
    config:
      operation: security-diff-scan
      repository: ./service
      base_ref: origin/main
      head_ref: HEAD
```

Set `working_tree: true` to review uncommitted changes instead. `head_ref` cannot be combined with `working_tree`, and path-scoped scans cannot be combined with Git diff targets. Diff targets require `repository` to be the Git worktree root and both selected revisions to be available locally.

## Validate findings

Pass a structured finding directly or load it from `finding_file`:

```yaml
providers:
  - id: openai:codex-security:gpt-5.6-sol
    config:
      operation: validation
      repository: ./isolated-checkout
      finding_file: ./fixtures/sql-injection.json
```

Validation returns JSON containing `disposition`, `report`, `outputDir`, and `threadId`. If `finding` and `finding_file` are omitted, the provider uses a structured `finding` eval-row variable when available; otherwise, it uses the rendered prompt as the finding text. Set `output_dir` to choose its evidence directory. Validation does not report reliable token/cost totals, and scan budget or deep-scan settings do not apply to it.

:::warning

Managed Codex Security scans run with the access required by the security SDK. Run scans only against repositories you are authorized to assess, and account for sensitive source-code excerpts in generated findings and artifacts.

:::

## Configuration

| Setting                                         | Applies to                | Description                                                                               |
| ----------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------- |
| `report_file`                                   | Saved reports             | Existing SDK scan or validation JSON; imports evidence instead of starting an operation.  |
| `operation`                                     | All operations            | Exact Codex Security skill name. Defaults to `security-scan`.                             |
| `model`                                         | All operations            | Codex model; can also be provided in the provider ID.                                     |
| `model_reasoning_effort` / `reasoning_effort`   | All operations            | Model reasoning effort. If both are set, they must match.                                 |
| `model_provider`                                | All operations            | Alternative Codex model provider.                                                         |
| `repository` / `working_dir`                    | All operations            | Repository path. A `repository` eval variable is also accepted.                           |
| `paths`                                         | Repository and deep scans | Repository-relative paths to assess.                                                      |
| `base_ref`, `head_ref`, `working_tree`          | Diff scans                | Committed-ref or working-tree target selection.                                           |
| `max_cost_usd`                                  | Scans                     | Estimated model-spend stopping threshold per scan; not a hard billing cap.                |
| `workers`, `subagents`                          | Deep scans                | Positive worker count and nonnegative subagent count; zero subagents is valid.            |
| `stop_after_no_new`, `max_discovery_runs`       | Deep scans                | Positive counts controlling when discovery stops.                                         |
| `max_time_hours`                                | Deep scans                | Positive discovery time limit up to 96 hours; fractional hours are supported.             |
| `scan_prompt`, `post_scan_prompt`               | Scans                     | Additional scan and follow-up instructions. Post-scan work is outside scan cost tracking. |
| `validation_prompt`                             | Standard and diff scans   | Custom validation instructions; unsupported in deep mode.                                 |
| `output_dir`                                    | All operations            | Private artifact directory outside the enclosing Git worktree.                            |
| `archive_existing`                              | Scans                     | Archive existing output before starting a new scan; does not apply to validation.         |
| `knowledge_base_paths`                          | Scans                     | Additional repository security context.                                                   |
| `expected_plugin_version`                       | Scans                     | Require the specified bundled plugin version.                                             |
| `failure_severity`                              | Scans                     | Record a severity threshold in the SDK recipe; does not itself fail a Promptfoo eval.     |
| `auth`                                          | All operations            | `auto`, `chatgpt`, or `api-key`; automatic selection can prefer environment keys.         |
| `plugin_path`, `python_path`, `codex_overrides` | All operations            | Security runtime configuration.                                                           |
| `finding`, `finding_file`                       | Validation                | Candidate vulnerability text or a structured finding.                                     |

Unset model, reasoning and deep-scan controls use the installed SDK's effective configuration. In SDK 0.1.31, the built-in model/effort defaults are `gpt-5.6-sol`/`xhigh`, and the deep discovery time limit defaults to 96 hours. Explicit provider settings and supported Codex overrides can change those defaults. Record the effective settings and SDK/plugin versions when comparing runs.

## Results, cost, and assertions

Native repository scans return `ScanResult.toJSON()` in `output`, including `manifest`, `findings`, `coverage`, artifact paths, and SDK cost data. Imports retain that SDK-shaped JSON too. Native execution also reports standard Promptfoo token and cost metrics when the SDK supplies them.

`metadata.codexSecurity` is the versioned summary shared by native and saved-report results. Version 1 includes:

| Field                                          | Meaning                                                                                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `source`                                       | Native SDK or saved-report input; imported file path and SHA-256 identify the bytes read, not their authenticity.                         |
| `operation`, `scanId`, `model`, `versions`     | Recorded scan/model identity and available SDK/plugin versions.                                                                           |
| `target`, `scope`                              | Recorded source revision/snapshot and review scope.                                                                                       |
| `status`, `coverage`, `findings`, `validation` | Execution status, coverage, current finding counts, or validation disposition. Missing findings remain unknown rather than becoming zero. |
| `cost`, `usage`                                | Recorded cost baseline/range/pricing context and token usage; missing values remain `null`.                                               |
| `elapsedMs`                                    | Duration from valid manifest start/end timestamps; never a substituted model-turn or file-read duration.                                  |
| `warnings`, `artifacts`                        | Observed warnings and references to files on the original host.                                                                           |

Saved-report cost, token usage, and elapsed time describe the original operation. Import incurs no new model usage (`incurredCost: 0`); its historical measurements remain in `metadata.codexSecurity`. Generic import cost/latency must not be interpreted as scan measurements. The result summary relies on this normalized metadata, while the raw output remains available for evidence inspection.

If you used the former flat provider metadata, migrate assertions to `metadata.codexSecurity`: `findingsCount` becomes `findings.total`, `sdkVersion`/`pluginVersion` become `versions.sdk`/`versions.plugin`, and `cost.estimatedUsd`/`cost.estimatedUsdRange` become `cost.baselineUsd`/`cost.range` (`minUsd`, `maxUsd`). `operation`, `model`, `coverage`, and `warnings` also move under this namespace; full deferred coverage details remain in the raw output. The SDK-shaped raw output is unchanged.

Finding validation does not currently expose reliable token or cost totals, so the provider leaves those fields unset. Missing usage means unreported, not free.

`max_cost_usd` stops work based on estimated model spend. In-flight requests can finish above it, and `post_scan_prompt` runs after cost tracking ends, outside that limit. SDK estimates use API-equivalent model pricing, not a ChatGPT subscription allowance. Inspect the estimated range when available rather than treating the baseline as an exact bill.

Coverage can be `complete`, `partial`, or `unknown`. A result with zero findings and incomplete coverage is not evidence of a clean repository. Current-run findings are in `findings.findings`; `repositoryFindings` can also contain earlier open findings. A Promptfoo pass reflects the assertions you configured. Add an explicit severity assertion if you need a severity gate: `failure_severity` alone only records SDK policy.

Use [named assertion metrics](/docs/configuration/expected-outputs#assertion-properties) to expose explicit checks in the comparison table. For example, require complete coverage:

```yaml
assert:
  - type: javascript
    metric: CompleteCoverage
    value: context.providerResponse?.metadata?.codexSecurity?.coverage?.completeness === 'complete'
```

This checks reported coverage, not detection accuracy. For recall and precision, define curated expected findings and adjudicate matches using source locations and evidence. Title/summary keyword matching alone can miss equivalent wording or count a passing mention. See the [comparison guide](/docs/guides/codex-security-results) for metric definitions and limitations.

`cost` assertions apply to native execution with a reported estimate; do not use them to compare imported historical spend or finding validation when usage is unreported. Finding output and stored artifacts may include sensitive source-code excerpts; configure Promptfoo retention and sharing accordingly.

## Troubleshooting

- **Zero findings with partial coverage:** Inspect `metadata.codexSecurity.warnings`, the raw output's `coverage.deferred`, and `coverage.json`. Discarded findings or malformed evidence references indicate an incomplete scan, not a clean repository.
- **Deep scan cost appears too low:** Install SDK version `0.1.18` or newer. Earlier versions can omit independently launched discovery and deduplication workers from token and cost totals.
- **SDK fails to load:** Install Promptfoo and the SDK together, and use Node.js `^22.22.0`, `^24.0.0`, or `^26.0.0`.
- **Python is unavailable:** Install Python 3.10+ (`tomli` is also required on 3.10), or point `python_path` at the supported interpreter. A successful local preflight does not verify Python or model access.
- **Authentication or access fails:** Sign in with Codex or set `OPENAI_API_KEY` / `CODEX_API_KEY`; confirm that the account has the required Codex Security and Trusted Access permissions.
- **Output directory is rejected:** Choose a private directory outside the target and its enclosing Git worktree, with trusted ownership and permissions. Use a distinct directory for each provider or eval row; validation requires an empty output directory.
- **Diff scan fails:** Set `base_ref`, or use `working_tree: true`; do not combine `working_tree` with `head_ref`.

## Related documentation

- [Evaluate a vulnerability-finding harness](/docs/guides/codex-security-results)
- [Official Codex Security SDK](https://learn.chatgpt.com/docs/security/sdk)
- [Codex Security authentication and troubleshooting](https://learn.chatgpt.com/docs/security/cli/faq)

- [OpenAI provider](./openai.md)
- [OpenAI Codex SDK](./openai-codex-sdk.md)
- [OpenAI Codex App Server](./openai-codex-app-server.md)
- [OpenAI Agents SDK](./openai-agents.md)
- [Test agent skills](/docs/guides/test-agent-skills)
- [Assertions and metrics](/docs/configuration/expected-outputs)
