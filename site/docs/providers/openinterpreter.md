---
title: Open Interpreter
description: Evaluate Open Interpreter with isolated workspaces, deterministic approvals, configurable backends, structured inputs, and rich coding-agent results.
---

# Open Interpreter

The Open Interpreter provider starts the Rust-based `interpreter app-server` locally and evaluates its coding-agent behavior over the stdio JSON-RPC protocol. The runtime is installed separately; Promptfoo does not install Python, Open Interpreter, or an agent SDK during its normal Node installation.

This integration targets Open Interpreter `rust-v0.0.21` or later. The legacy `open-interpreter` Python package has a different API and is not supported by this provider.

## Installation

Install the current Open Interpreter CLI and verify that it is available:

```bash
curl -fsSL https://www.openinterpreter.com/install | sh
interpreter --version
```

Open Interpreter can use OpenAI, Anthropic-style, OpenAI-compatible, Ollama, LM Studio, Bedrock, and other configured backends. Set the credential required by the selected backend without committing it:

```bash
export OPENAI_API_KEY=your_api_key_here
```

For an installation outside `PATH`, set `interpreter_path` to the executable.

## Provider IDs

```yaml
providers:
  - openinterpreter
  - openinterpreter:gpt-5.4
```

The optional model suffix is forwarded as `model` and takes precedence over `config.model`.

## Quick Start

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Read-only Open Interpreter eval

prompts:
  - 'Read README.md and summarize the project in one sentence.'

providers:
  - id: openinterpreter:gpt-5.4
    config:
      working_dir: ./workspace
      sandbox_mode: read-only
      turn_timeout_ms: 120000

tests:
  - assert:
      - type: contains
        value: project
```

Run it from the directory containing the config:

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache -o output.json
```

## Safety Defaults

Open Interpreter can execute commands and modify files. Promptfoo starts it with an isolated home and, when `working_dir` is omitted, an empty temporary workspace. The home, workspace, and child process are removed at the end of the eval.

| Setting               | Default     | Effect                                                                |
| --------------------- | ----------- | --------------------------------------------------------------------- |
| `sandbox_mode`        | `read-only` | Prevents writes from the agent runtime.                               |
| `approval_policy`     | `untrusted` | Requests approval for commands outside the trusted set.               |
| `ephemeral`           | `true`      | Prevents session transcripts from being persisted.                    |
| `reuse_server`        | `false`     | Starts a fresh app-server process for each row.                       |
| `inherit_process_env` | `false`     | Passes a minimal process environment and configured credentials only. |
| `allow_remote_images` | `false`     | Rejects remote image inputs unless explicitly enabled.                |
| `turn_timeout_ms`     | `120000`    | Interrupts turns that do not finish within two minutes.               |

Command approvals, file-change approvals, permission grants, user-input requests, and MCP elicitations are declined or answered with an empty value by default. This keeps non-interactive evals deterministic and avoids silently accepting side effects. Open Interpreter's non-interactive `exec` command forces approvals off, so this provider deliberately uses app-server instead.

:::warning
`workspace-write`, accepted approvals, inherited environment variables, live network access, and especially `danger-full-access` can expose credentials or modify the host. Use a disposable workspace or an external sandbox and grant only the access required by the test.
:::

Open Interpreter's runtime sandbox is not a security boundary for hostile models. Do not evaluate untrusted prompts against a workspace containing secrets.

## Configuration

The provider validates top-level config strictly. Relative paths resolve from the directory containing the Promptfoo config.

| Parameter                | Type          | Description                                                                                                               |
| ------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `interpreter_path`       | string        | Path to the `interpreter` executable. Defaults to `interpreter` on `PATH`.                                                |
| `interpreter_home`       | string        | Existing Open Interpreter home for saved login/config. Defaults to a temporary isolated home.                             |
| `model`                  | string        | Model passed to Open Interpreter.                                                                                         |
| `model_provider`         | string        | Open Interpreter backend/provider ID, such as `openai`, `anthropic`, `openrouter`, `ollama`, or `lmstudio`.               |
| `apiKey`                 | string        | Explicit API key. Prefer an environment variable.                                                                         |
| `base_url`               | string        | OpenAI-compatible base URL.                                                                                               |
| `working_dir`            | string        | Agent workspace. Defaults to an empty temporary directory.                                                                |
| `additional_directories` | string[]      | Additional workspace roots.                                                                                               |
| `skip_git_repo_check`    | boolean       | Permit a non-Git workspace. Automatically enabled for the temporary workspace.                                            |
| `sandbox_mode`           | string        | `read-only`, `workspace-write`, or `danger-full-access`.                                                                  |
| `approval_policy`        | string/object | `untrusted`, `on-request`, `never`, legacy `on-failure`, or a granular app-server approval policy.                        |
| `server_request_policy`  | object        | Deterministic responses for command/file approvals, permissions, user input, MCP, and dynamic tools.                      |
| `network_access_enabled` | boolean       | Enables runtime network access when supported by the sandbox policy.                                                      |
| `harness`                | string        | `native`, `claude-code`, `claude-code-bare`, `zcode`, `kimi-cli`, `qwen-code`, `deepseek-tui`, `swe-agent`, or `minimal`. |
| `harness_guidance`       | boolean       | Include the selected harness reliability guidance.                                                                        |
| `model_reasoning_effort` | string        | Runtime-supported reasoning level.                                                                                        |
| `reasoning_summary`      | string        | `auto`, `concise`, `detailed`, or `none`.                                                                                 |
| `output_schema`          | object        | JSON Schema for the final response.                                                                                       |
| `thread_id`              | string        | Resume an explicitly selected saved thread.                                                                               |
| `persist_threads`        | boolean       | Reuse a thread for matching rows. This is opt-in because it makes results order-dependent.                                |
| `thread_pool_size`       | number        | Maximum cached persistent-thread count.                                                                                   |
| `ephemeral`              | boolean       | Keep the runtime thread ephemeral. Defaults to `false` when resuming `thread_id`.                                         |
| `cli_config`             | object        | Additional Open Interpreter TOML config overrides passed as individual `-c key=value` arguments.                          |
| `cli_env`                | object        | Explicit environment variables for the child process and its tools.                                                       |
| `inherit_process_env`    | boolean       | Forward the complete Promptfoo process environment.                                                                       |
| `reuse_server`           | boolean       | Reuse the app-server process across rows.                                                                                 |
| `request_timeout_ms`     | number        | JSON-RPC request timeout.                                                                                                 |
| `startup_timeout_ms`     | number        | App-server initialization timeout.                                                                                        |
| `turn_timeout_ms`        | number        | Overall turn timeout; Promptfoo interrupts and cleans up a timed-out turn.                                                |
| `include_raw_events`     | boolean       | Include sanitized protocol notifications in `raw`.                                                                        |
| `allow_remote_images`    | boolean       | Permit public HTTP(S) image URLs. Local, private, and link-local URLs are rejected.                                       |

Open Interpreter-specific `harness`, `harness_guidance`, and backend configuration are passed through its native config surface. Promptfoo disables analytics, feedback, and runtime memories by default; an explicit `cli_config` value can opt in.

### Backends and Environment

To use a configured Open Interpreter backend, pass its ID and only the credential that backend needs:

```yaml
providers:
  - id: openinterpreter
    config:
      model_provider: openrouter
      model: openai/gpt-5.4
      harness: native
      cli_env:
        OPENROUTER_API_KEY: '{{env.OPENROUTER_API_KEY}}'
```

For a custom OpenAI-compatible backend, use `cli_config.model_providers` and an environment-key reference:

```yaml
providers:
  - id: openinterpreter
    config:
      model_provider: local
      model: local-coder
      cli_config:
        model_providers:
          local:
            name: Local inference
            base_url: http://127.0.0.1:8000/v1
            env_key: LOCAL_MODEL_API_KEY
            wire_api: responses
      cli_env:
        LOCAL_MODEL_API_KEY: '{{env.LOCAL_MODEL_API_KEY}}'
```

Credentials supplied in `cli_env` are visible to commands executed by the agent. Avoid `inherit_process_env: true` in shared or CI environments.

### Approvals and Side Effects

To test file writes in a disposable workspace, enable the workspace-write sandbox and explicitly accept the relevant approvals:

```yaml
providers:
  - id: openinterpreter:gpt-5.4
    config:
      working_dir: ./disposable-workspace
      sandbox_mode: workspace-write
      approval_policy: untrusted
      server_request_policy:
        command_execution: accept
        file_change: accept
```

Keep `server_request_policy` omitted to test refusals and permission handling. Approval decisions and command/file trajectories are available in response metadata.

## Prompt Inputs

Plain prompts work as usual. Common chat-message arrays are converted to a role-labelled prompt without interpreting message content:

```json
[
  { "role": "system", "content": "Return a concise answer." },
  { "role": "user", "content": "Summarize README.md." }
]
```

The app-server also accepts structured text, local-image, skill, and mention inputs:

```json
[
  { "type": "text", "text": "Review this screenshot." },
  { "type": "local_image", "path": "screenshots/failure.png" }
]
```

Local input paths, including symlink targets, must remain within `working_dir` or `additional_directories`. Remote image URLs require `allow_remote_images: true` and must be public HTTP(S) URLs.

## Results and Troubleshooting

The final assistant response is returned as `output`. When the runtime reports usage, Promptfoo records `tokenUsage` and an estimated `cost` where pricing is known; it does not invent usage or cost data. The thread is returned as `sessionId`. Individual protocol messages and total streamed turn events are bounded to prevent a broken runtime from exhausting memory; oversized streams fail the row and terminate the child process. Sanitized trajectories, approval decisions, item counts, and turn IDs are exposed under:

```js
providerResponse.metadata.openInterpreter.threadId;
providerResponse.metadata.openInterpreter.turnId;
providerResponse.metadata.openInterpreter.itemCounts;
providerResponse.metadata.openInterpreter.items;
providerResponse.metadata.openInterpreter.serverRequests;
```

The compatible `metadata.codexAppServer` and `raw.items` fields remain available for existing coding-agent assertions and trace tooling.

If startup fails, verify `interpreter --version` and `interpreter app-server --help`, then set `interpreter_path` if necessary. If authentication fails, check that the selected backend credential exists, or point `interpreter_home` at an existing authenticated home. If a workspace is rejected, set `skip_git_repo_check: true` only for a disposable non-Git directory. Increase `turn_timeout_ms` for a genuinely long task; repeated timeouts or unexpected writes should be investigated before loosening permissions.

See the runnable [Open Interpreter example](https://github.com/promptfoo/promptfoo/tree/main/examples/openinterpreter) and the [coding-agent eval guide](/docs/guides/evaluate-coding-agents).
