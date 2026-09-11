---
sidebar_label: Agent Rubric
description: 'Use coding-agent graders to verify outputs against files, tools, and other runtime evidence'
---

# Agent Rubric

`agent-rubric` is an agentic variant of [`llm-rubric`](/docs/configuration/expected-outputs/model-graded/llm-rubric). It grades an output against a natural-language rubric, but requires a coding-agent provider that can gather evidence using its configured tools and workspace.

Use it when the judge needs to inspect an artifact rather than only read the target output, for example to verify a claimed code change, locate a generated file, or check a repository-level requirement.

## Basic usage

Without an explicit grading provider, `agent-rubric` uses `openai:codex-sdk` in an isolated temporary working directory with read-only sandboxing, no approvals, and structured JSON grading output:

```yaml
tests:
  - assert:
      - type: agent-rubric
        value: Verify any claims in the output using the evidence available to the grader.
```

The isolated default is useful for agent behavior and tool availability checks, but it does not expose your project files. To let the grader inspect a fixture or repository, explicitly configure a working directory:

```yaml
tests:
  - assert:
      - type: agent-rubric
        value: Verify that the output accurately describes the exported API in src/report.ts.
        provider:
          id: openai:codex-sdk
          config:
            working_dir: ./sample-project
            sandbox_mode: read-only
            approval_policy: never
            skip_git_repo_check: true
```

Install and authenticate the [OpenAI Codex SDK provider](/docs/providers/openai-codex-sdk) before using the implicit default.

## Per-test-case workspaces

Top-level strings in the grading provider's `config` support Nunjucks templates, including `{{ variable }}` expressions and `{% if ... %}` blocks. Templates use each test case's final `vars` and the suite's `nunjucksFilters` before the grader is created:

```yaml
prompts:
  - '{{summary}}'
providers:
  - echo

tests:
  - vars:
      trace_id: abc123
      summary: Updated the parser.
  - vars:
      trace_id: def456
      summary: Added input validation.

defaultTest:
  assert:
    - type: agent-rubric
      value: Check whether the change described in `summary.md` matches the diff.
      provider:
        id: openai:codex-sdk
        config:
          working_dir: ./evidence/{{trace_id}}
          sandbox_mode: read-only
          approval_policy: never
          skip_git_repo_check: true
```

Prepare an evidence directory for each case before running the eval. Interpolating an undefined variable causes an error rather than silently selecting a shared parent directory; use Nunjucks's `default` filter for intentional fallbacks.

Inline provider definitions, YAML/JSON provider files, and the `provider.text` form are supported. Per-case rendering applies only to `agent-rubric` and top-level config strings. Nested objects/arrays keep the provider's existing behavior, and already-constructed provider instances are used unchanged. Rendered top-level strings must not contain remaining Nunjucks syntax (`{{`, `{%`, or `{#`); such values are rejected so provider runtimes cannot interpret test data as another template.

## Supported agent providers

`agent-rubric` accepts the coding-agent runtimes that promptfoo can run as providers:

| Runtime                 | Provider ID                                             |
| ----------------------- | ------------------------------------------------------- |
| OpenAI Codex SDK        | `openai:codex-sdk` or `openai:codex`                    |
| OpenAI Codex app-server | `openai:codex-app-server` or `openai:codex-desktop`     |
| Claude Agent SDK        | `anthropic:claude-agent-sdk` or `anthropic:claude-code` |
| OpenCode SDK            | `opencode:sdk` or `opencode`                            |

For example, use Claude Agent SDK as the judge with read-only filesystem tools:

```yaml
assert:
  - type: agent-rubric
    value: Inspect the project and verify that the response names the correct configuration file.
    provider:
      id: anthropic:claude-agent-sdk
      config:
        working_dir: ./sample-project
```

A plain text provider such as `openai:responses:gpt-5` is rejected for `agent-rubric`. Use `llm-rubric` when the grader only needs the output and rubric text.

## Safety and side effects

An agentic grader processes untrusted target output and may read untrusted workspace content. The default grading prompt instructs it to treat that material as evidence rather than instructions, and the implicit Codex provider is read-only.

Keep grader workspaces read-only whenever possible. If you enable write access, shell actions, network access, MCP tools, or app connectors, those actions are performed by the grader itself during the eval and should be limited to disposable or controlled environments.

## Results and configuration

`agent-rubric` uses the same `{ reason, pass, score }` result and `threshold`, `rubricPrompt`, and `not-` semantics as `llm-rubric`:

```yaml
assert:
  - type: agent-rubric
    value: Confirm that the output's implementation claim is supported by the workspace.
    threshold: 0.8
```

Provider response metadata, such as agent tool calls, is preserved on the grading result. The result also includes `metadata.agentProvider` identifying the agent runtime used for the check.
