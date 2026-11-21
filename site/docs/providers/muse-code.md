---
title: Muse Code
description: Evaluate Meta's Muse Code CLI with workspace files, native agent tools, model and permission controls, and session reuse.
sidebar_position: 42
---

# Muse Code

The `muse-code` provider runs [Meta's Muse Code](https://dev.meta.ai/docs/muse-code) coding agent through `muse exec --json`. It evaluates the installed agent, including its file tools and project context. For direct model requests, use the [Meta Model API provider](./meta.md).

Install Muse Code 1.0.2 or later on macOS or Linux using the [official guide](https://dev.meta.ai/docs/muse-code). Check your installed version before running an eval.

```bash
muse --version
```

Sign in with Muse Code or set `META_API_KEY` in the environment of the Promptfoo process. Set `MUSE_AUTH_PATH` and `MUSE_CLI_PATH` in the same process environment if needed. Promptfoo rejects overrides of these three variables in provider or suite configuration and invocation-specific environment files, even when the value is empty. Custom endpoints, inline keys and child `env` are unsupported. The direct Meta Model API provider uses `MODEL_API_KEY`.

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

| Option                        | Type    | Description                                                                                                              |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| `muse_path`                   | string  | Path to the installed executable. Defaults to `MUSE_CLI_PATH`, then `muse` on `PATH`.                                    |
| `working_dir`                 | string  | Workspace, resolved relative to the config file. Defaults to a new temporary directory for each call.                    |
| `model`                       | string  | Model ID. Omit to use Muse Code's default.                                                                               |
| `reasoning_effort`            | string  | `minimal`, `low`, `medium`, `high`, `xhigh`, or `ultra`. Omit to use Muse Code's default.                                |
| `approval_mode`               | string  | `untrusted`, `on-request`, or `never`. Omit to keep Muse Code's approval policy.                                         |
| `approval_judge`              | boolean | Enable or disable Muse Code's automatic approval judge.                                                                  |
| `sandbox_network`             | string  | `proxy-only`, `restricted`, or `enabled`. Defaults to `restricted`.                                                      |
| `disable_shell`               | boolean | Disable shell execution. Defaults to `true`.                                                                             |
| `disable_write`               | boolean | Disable writes by non-shell file tools. Combine with `disable_shell` for a read-only workspace eval. Defaults to `true`. |
| `disable_web_tools`           | boolean | Disable Muse Code's web tools. Defaults to `true`.                                                                       |
| `disable_sandbox`             | boolean | Disable native sandboxing and file-tool confinement. Omit to keep Muse Code's sandbox policy.                            |
| `trust_workspace`             | boolean | Load project rules, skills, and hooks for this run. Does not disable the sandbox.                                        |
| `no_foreign_personal_context` | boolean | Exclude personal rules and skills imported from other coding agents. Defaults to `true`.                                 |
| `session_id`                  | string  | Resume a UUID returned earlier by the same provider instance. Requires `working_dir` and retained session logs.          |
| `no_session_log`              | boolean | Disable Muse's retained session state. Defaults to true for new sessions and false with `session_id`.                    |
| `max_model_steps`             | number  | Positive limit on the model steps in a run.                                                                              |
| `timeout_ms`                  | number  | Process timeout in milliseconds. Defaults to `300000` (5 minutes).                                                       |
| `max_output_bytes`            | number  | Combined stdout/stderr limit. Defaults to 10 MiB. Exceeding it stops the run with an error.                              |

Only `model`, `reasoning_effort` and `session_id` accept prompt-level overrides and simple test variable references such as `model: '{{model}}'`. Promptfoo validates their values after rendering. Executable, permission and workspace options belong in trusted provider configuration.

## Workspaces and permissions

Promptfoo disables shell execution, file writes, web tools and foreign personal context by default. It restricts sandbox networking and keeps Muse Code's sandbox and approval policy. Run trusted projects and review your installed CLI's settings, including MCP tools. See Meta's [permissions guide](https://dev.meta.ai/docs/muse-code/permissions).

Changes in an explicit `working_dir` persist. Set `evaluateOptions.maxConcurrency: 1` when enabling shell, writes or project hooks. Promptfoo rejects overlapping mutating calls on the same workspace. Without `working_dir`, each call gets a temporary directory.

When you use Muse Code as an `agent-rubric` grader, it can inspect a live workspace copy created by the evaluator. Other per-test workspace paths are rejected.

The headless CLI cancels clarification questions. Tools requiring human approval may wait until `timeout_ms`.

The child receives the process key, selected OS, locale, certificate and login paths, and a filtered `PATH`. Executables and search directories must be outside the workspace, config directory, current directory and their Git repositories. This also applies to explicitly configured executables and symlink targets. A trusted absolute search directory is required. Automatic CLI updates are disabled.

## Sessions and results

Every call starts a fresh Muse Code process and session by default. Promptfoo does not cache responses or retry failed runs, because an attempt may have changed the workspace.

To continue a session returned by this provider instance, set `session_id`, the same `working_dir`, and `evaluateOptions.maxConcurrency: 1`. Promptfoo rejects session IDs whose earlier credential history is unavailable, because it could not redact secrets recalled from that history. Concurrent calls to the same explicit session are rejected to prevent overlapping turns.

Set `working_dir` and `no_session_log: false` on an initial run to retain its session. Retaining a session without an explicit workspace is rejected. Session reuse checks the canonical workspace path, including symlink targets.

Promptfoo removes its temporary prompt files and terminates the CLI, including its process group on POSIX systems. It leaves Muse Code's retained sessions and user workspaces intact.

If output pipes remain open after termination, Promptfoo closes them after a one-second cleanup grace period and returns an error.

The response includes the final `output`, `sessionId` and `metadata.runId`. Promptfoo omits the raw journal and process stderr. It redacts the current process key and keys used in earlier turns before tracing and returning the response. Muse Code manages its own stored credentials.

Nonzero exits, failed or cancelled runs, malformed JSONL and missing completion events are errors. Only the current root run can provide the final answer. Use assertions and project tests to check it.

Tracing records the provider call. Token usage, costs, and individual tool spans are not currently normalized from Muse Code's journal.

## See also

- [Muse Code headless documentation](https://dev.meta.ai/docs/muse-code/extending#headless)
- [Meta Model API](./meta.md)
- [OpenAI Codex SDK](./openai-codex-sdk.md)
- [Claude Agent SDK](./claude-agent-sdk.md)
