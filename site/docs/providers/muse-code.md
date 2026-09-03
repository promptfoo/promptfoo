---
title: Muse Code
description: Evaluate Meta's Muse Code CLI with workspace files, native agent tools, model and permission controls, session reuse, and structured execution events.
sidebar_position: 42
---

# Muse Code

The `muse-code` provider runs [Meta's Muse Code](https://dev.meta.ai/docs/muse-code) coding agent through `muse exec --json`. It evaluates the installed agent, including its file tools and project context. For direct model requests, use the [Meta Model API provider](./meta.md).

Requires Muse Code 1.0.2 or later on macOS or Linux. Install and authenticate before running an eval:

```bash
curl -fsSL https://dev.meta.ai/install.sh | bash
muse --version
export META_API_KEY="your-api-key"
```

An existing Muse Code login also works. `config.apiKey` takes precedence over `config.env.META_API_KEY`, provider environment overrides, and the process's `META_API_KEY`. Without an explicit key, Muse Code resolves its stored credentials. Muse Code uses `META_API_KEY`; the direct Meta Model API provider uses `MODEL_API_KEY`.

## Quick start

```yaml title="promptfooconfig.yaml"
prompts:
  - 'Read math.js. Which function multiplies two numbers? Answer with only its name.'

providers:
  - id: muse-code
    config:
      working_dir: ./workspace
      disable_shell: true
      disable_write: true
      disable_web_tools: true
      no_foreign_personal_context: true
      max_model_steps: 6

tests:
  - assert:
      - type: equals
        value: multiply
```

Create `workspace/math.js` containing the function to evaluate, or use the complete example:

```bash
npx promptfoo@latest init --example muse-code
cd muse-code
npx promptfoo@latest eval --no-cache
```

Use `muse-code:<model>` or `config.model` to select a model, for example `muse-code:muse-spark-1.2`. When neither is set, Muse Code selects its configured default. A model in the provider ID takes precedence over provider-level `config.model`.

## Configuration

| Option                        | Type    | Description                                                                                           |
| ----------------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `apiKey`                      | string  | Meta API key. Omit to use environment credentials or an existing Muse Code login.                     |
| `muse_path`                   | string  | Path to the installed executable. Defaults to `MUSE_CLI_PATH`, then `muse` on `PATH`.                 |
| `working_dir`                 | string  | Workspace, resolved relative to the config file. Defaults to a new temporary directory for each call. |
| `model`                       | string  | Model ID. Omit to use Muse Code's default.                                                            |
| `base_url`                    | string  | Custom provider endpoint, passed as `--base-url`.                                                     |
| `reasoning_effort`            | string  | `minimal`, `low`, `medium`, `high`, `xhigh`, or `ultra`. Omit to use Muse Code's default.             |
| `approval_mode`               | string  | `untrusted`, `on-request`, or `never`. Omit to keep Muse Code's approval policy.                      |
| `approval_judge`              | boolean | Enable or disable Muse Code's automatic approval judge.                                               |
| `sandbox_network`             | string  | `proxy-only`, `restricted`, or `enabled`. Omit to keep Muse Code's network policy.                    |
| `disable_shell`               | boolean | Disable shell execution.                                                                              |
| `disable_write`               | boolean | Disable writes by non-shell file tools. Combine with `disable_shell` for a read-only workspace eval.  |
| `disable_web_tools`           | boolean | Disable Muse Code's web tools.                                                                        |
| `disable_sandbox`             | boolean | Disable native sandboxing and file-tool confinement. Omit to keep Muse Code's sandbox policy.         |
| `trust_workspace`             | boolean | Load project rules, skills, and hooks for this run. Does not disable the sandbox.                     |
| `no_foreign_personal_context` | boolean | Exclude personal rules and skills imported from other coding agents.                                  |
| `session_id`                  | string  | Resume a specific UUID. Requires `working_dir` and retained session logs.                             |
| `no_session_log`              | boolean | Disable Muse's retained session state. Defaults to true for new sessions and false with `session_id`. |
| `max_model_steps`             | number  | Positive limit on the model steps in a run.                                                           |
| `timeout_ms`                  | number  | Process timeout in milliseconds. Defaults to `300000` (5 minutes).                                    |
| `max_output_bytes`            | number  | Combined stdout/stderr limit. Defaults to 10 MiB. Exceeding it stops the run with an error.           |
| `env`                         | object  | Additional environment variables for the child process.                                               |

Prompt-level configuration overrides provider-level configuration. String values can use test variables such as `model: '{{model}}'` or `reasoning_effort: '{{effort}}'`. Constrained values are validated after rendering.

## Workspaces and permissions

Muse Code can edit files and run commands. Promptfoo inherits its native sandbox and approval policy unless you override them in provider configuration. Review your Muse settings before running an eval. With an explicit `working_dir`, workspace changes persist after the eval. Without one, Promptfoo creates and removes a temporary workspace for each call.

For read-only evals, set both `disable_shell: true` and `disable_write: true`. Shell sandbox network settings do not disable web or MCP tools. See Meta's [permissions guide](https://dev.meta.ai/docs/muse-code/permissions) for the boundaries of each option.

Promptfoo always enables `--user-input-auto-resolve`, which cancels clarification questions in headless mode. This does not grant tool approval. A run that still needs human approval may remain pending until `timeout_ms`; configure `approval_mode: never` when you explicitly want unattended tool execution within the native sandbox.

The child receives a small environment containing OS paths, locale, XDG directories, proxy/certificate settings, and Muse credentials. Other process environment variables are not inherited automatically; pass required values through `config.env`. Promptfoo resolves the Muse executable using absolute `PATH` directories before starting it in the workspace; empty and relative entries are ignored for this lookup. Set `muse_path` to use a specific executable. The Muse launcher is started with automatic updates disabled so an eval uses the installed binary.

## Sessions and results

Every call starts a fresh Muse Code process and session by default. Promptfoo does not cache responses because agent tools, local settings, and workspace state can change between calls.

To continue an existing session, set `session_id`, the same `working_dir`, and `evaluateOptions.maxConcurrency: 1`. Concurrent calls to the same explicit session on one provider instance are rejected to prevent overlapping turns. Use an explicit `working_dir` and `no_session_log: false` on an initial run if you want to retain its session for later use. Promptfoo removes its temporary prompt files and terminates the CLI, including its process group on POSIX systems. It leaves Muse Code's retained sessions and user workspaces intact.

If output pipes remain open after termination, Promptfoo closes them after a one-second cleanup grace period and returns an error.

The response contains:

- `output`: the current run's final assistant text.
- `sessionId` and `metadata.runId`: native identifiers for the session and run.
- `raw`: the parsed Muse Code JSONL journal, including available task and tool events.

Promptfoo redacts literal occurrences of credential values from response fields and journal data before tracing or export. This includes the supplied Meta API key, child environment values with credential names such as `GITHUB_PAT` or `DATABASE_PASSWORD`, recognizable token values, and authentication in proxy or endpoint URLs.

Nonzero exits, failed or cancelled terminal events, malformed JSONL, and missing completion events produce provider errors. Intermediate output and subagent completions do not count as a completed root run. An agent completing successfully does not prove its answer or code is correct; use assertions and project tests to check the result.

Tracing records the provider call. Token usage, costs, and individual tool spans are not currently normalized from Muse Code's journal.

## See also

- [Muse Code headless documentation](https://dev.meta.ai/docs/muse-code/extending#headless)
- [Meta Model API](./meta.md)
- [OpenAI Codex SDK](./openai-codex-sdk.md)
- [Claude Agent SDK](./claude-agent-sdk.md)
