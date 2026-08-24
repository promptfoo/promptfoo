---
sidebar_position: 43
sidebar_label: Codex Security SDK
title: OpenAI Codex Security SDK
description: Compare Codex Security scans, finding validation, model reasoning, repository coverage, token usage, and estimated cost in Promptfoo evals.
---

# OpenAI Codex Security SDK

The Codex Security provider runs the `@openai/codex-security` SDK directly as a Promptfoo provider. Use it to compare standard and deep scans, models, reasoning effort, vulnerability recall, finding validation, token usage, and estimated scan cost.

| Provider                                         | Best for                                                        | Provider ID                     |
| ------------------------------------------------ | --------------------------------------------------------------- | ------------------------------- |
| Codex Security SDK                               | Repository security scans, validated findings, and coverage     | `openai:codex-security:<model>` |
| [Codex SDK](./openai-codex-sdk.md)               | General coding-agent tasks, local skills, and structured output | `openai:codex-sdk`              |
| [Codex App Server](./openai-codex-app-server.md) | Rich-client protocol events, approvals, and thread lifecycle    | `openai:codex-app-server`       |
| [OpenAI Agents](./openai-agents.md)              | Application agents, tools, handoffs, and sessions               | `openai:agents:<agent>`         |

## Installation and authentication

Promptfoo declares the SDK as an optional dependency. Install it manually if optional dependencies were omitted:

```bash
npm install @openai/codex-security@^0.1.18
```

The provider requires `@openai/codex-security` version `0.1.18` or newer. Older SDK releases omit finding validation and can undercount deep-worker token usage and cost. The SDK supports Node.js `^22.13.0`, `^24.0.0`, and `^26.0.0`. Promptfoo loads the SDK only from its own installation; it does not execute SDK packages found in the target repository or evaluation directory. Use an existing Codex/ChatGPT login, or set `OPENAI_API_KEY` or `CODEX_API_KEY` in the process environment before starting promptfoo. The native SDK does not support provider-scoped API keys or provider environment overrides; credentials must already be present in the Promptfoo process environment.

Codex Security access, Trusted Access, and model availability depend on the authenticated account and organization.

## Configure in the web UI

Open **Setup**, select **Add Provider**, and search for **Codex Security SDK** or **security**. The provider is listed under **Agent Frameworks** and uses the native `openai:codex-security:<model>` provider ID rather than a Python adapter.

Choose a security operation, repository path, model, reasoning effort, authentication method, and optional scan cost limit. Configure advanced deep-scan workers, subagents, discovery limits, and runtime limits in YAML when needed.

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

To start with the included intentionally vulnerable fixture:

```bash
npx promptfoo@latest init --example openai-codex-security
cd openai-codex-security
npm install @openai/codex-security@^0.1.18
npx promptfoo eval --no-cache
```

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

Set `working_tree: true` to review uncommitted changes instead. `head_ref` cannot be combined with `working_tree`, and path-scoped scans cannot be combined with Git diff targets.

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

Validation returns JSON containing `disposition`, `report`, `outputDir`, and `threadId`. If `finding` and `finding_file` are omitted, the provider uses a structured `finding` eval-row variable when available; otherwise, it uses the rendered prompt as the finding text.

:::warning

Managed Codex Security scans run with the access required by the security SDK. Run scans only against repositories you are authorized to assess, and account for sensitive source-code excerpts in generated findings and artifacts.

:::

## Configuration

| Setting                                                     | Applies to                | Description                                                     |
| ----------------------------------------------------------- | ------------------------- | --------------------------------------------------------------- |
| `operation`                                                 | All operations            | Exact Codex Security skill name. Defaults to `security-scan`.   |
| `model`                                                     | All operations            | Codex model; can also be provided in the provider ID.           |
| `model_reasoning_effort` / `reasoning_effort`               | All operations            | Model reasoning effort. If both are set, they must match.       |
| `model_provider`                                            | All operations            | Alternative Codex model provider.                               |
| `repository` / `working_dir`                                | All operations            | Repository path. A `repository` eval variable is also accepted. |
| `paths`                                                     | Repository and deep scans | Repository-relative paths to assess.                            |
| `base_ref`, `head_ref`, `working_tree`                      | Diff scans                | Committed-ref or working-tree target selection.                 |
| `max_cost_usd`                                              | Scans                     | Hard SDK scan-cost ceiling.                                     |
| `workers`, `subagents`                                      | Deep scans                | Discovery worker and subagent counts.                           |
| `stop_after_no_new`, `max_discovery_runs`, `max_time_hours` | Deep scans                | Variance, coverage, and runtime stopping controls.              |
| `scan_prompt`, `validation_prompt`, `post_scan_prompt`      | Scans                     | Additional instructions for individual scan phases.             |
| `output_dir`, `archive_existing`                            | Scans                     | Scan artifact location and replacement behavior.                |
| `knowledge_base_paths`                                      | Scans                     | Additional repository security context.                         |
| `expected_plugin_version`, `failure_severity`               | Scans                     | Plugin-version and severity policies.                           |
| `auth`                                                      | All operations            | `auto`, `chatgpt`, or `api-key`.                                |
| `plugin_path`, `python_path`, `codex_overrides`             | All operations            | Security runtime configuration.                                 |
| `finding`, `finding_file`                                   | Validation                | Candidate vulnerability text or a structured finding.           |

## Results, cost, and assertions

Repository scans return `ScanResult.toJSON()` in `output`, including `manifest`, `findings`, `coverage`, artifact paths, and SDK cost data. Promptfoo also normalizes SDK-reported values into:

- `tokenUsage.prompt`, `tokenUsage.completion`, `tokenUsage.cached`, and `tokenUsage.total`.
- `tokenUsage.completionDetails.reasoning`, `cacheReadInputTokens`, and `cacheCreationInputTokens` when reported.
- `cost`, using the security SDK's `estimatedUsd` value.
- `metadata.operation`, `metadata.mode`, `metadata.model`, `metadata.reasoningEffort`, `metadata.findingsCount`, `metadata.coverage`, artifact paths, warnings, SDK version, and plugin version.
- `metadata.skillCalls` for native scan and finding-validation operation routing.

Finding validation does not currently expose reliable token or cost totals, so the provider leaves those fields unset.

Use [named assertion metrics](/docs/configuration/expected-outputs#assertion-properties) to compare finding recall, skill routing, scan coverage, latency, and spend in the web UI:

```yaml
tests:
  - description: Finds known application vulnerabilities
    vars:
      expectedFindings: command injection,authentication bypass
    assert:
      - type: is-json
      - type: skill-used
        value:
          pattern: '*security-scan'
        metric: SecuritySkill
      - type: javascript
        metric: FindingRecall
        value: |
          const scan = JSON.parse(output);
          const findings = scan.findings?.findings ?? [];
          const found = findings
            .map((finding) => `${finding.title ?? ''} ${finding.summary ?? ''}`.toLowerCase())
            .join(' ');
          const expected = context.vars.expectedFindings.split(',').map((value) => value.trim());
          const matches = expected.filter((value) => found.includes(value.toLowerCase()));
          const recall = matches.length / expected.length;
          return {
            pass: recall >= 0.5,
            score: recall,
            reason: `Found ${matches.length} of ${expected.length} expected vulnerability classes`,
          };
      - type: javascript
        metric: CompleteCoverage
        value: context.providerResponse?.metadata?.coverage?.completeness === 'complete'
      - type: cost
        threshold: 2
        metric: ScanCost
      - type: latency
        threshold: 3600000
        metric: ScanLatency
```

`cost` assertions require a native scan that reports estimated spend; do not use them for finding validation when the SDK omits usage. Finding output and stored artifacts may include sensitive source-code excerpts; configure Promptfoo retention and sharing accordingly.

## Troubleshooting

- **Zero findings with partial coverage:** Inspect `metadata.warnings`, `metadata.coverage.deferred`, and `coverage.json`. Discarded findings or malformed evidence references indicate an incomplete scan, not a clean repository.
- **Deep scan cost appears too low:** Install SDK version `0.1.18` or newer. Earlier versions can omit independently launched discovery and deduplication workers from token and cost totals.
- **SDK fails to load:** Use a supported even-numbered Node.js release: `^22.13.0`, `^24.0.0`, or `^26.0.0`.
- **Authentication or access fails:** Sign in with Codex or set `OPENAI_API_KEY` / `CODEX_API_KEY`; confirm that the account has the required Codex Security and Trusted Access permissions.
- **Output directory is rejected:** Choose an artifact directory outside the target repository, and use a distinct directory for each provider or eval row.
- **Diff scan fails:** Set `base_ref`, or use `working_tree: true`; do not combine `working_tree` with `head_ref`.

## Related documentation

- [OpenAI provider](./openai.md)
- [OpenAI Codex SDK](./openai-codex-sdk.md)
- [OpenAI Codex App Server](./openai-codex-app-server.md)
- [OpenAI Agents SDK](./openai-agents.md)
- [Test agent skills](/docs/guides/test-agent-skills)
- [Assertions and metrics](/docs/configuration/expected-outputs)
