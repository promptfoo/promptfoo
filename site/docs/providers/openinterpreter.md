---
title: Open Interpreter
description: Evaluate the Rust Open Interpreter app-server with isolated workspaces, deterministic approvals, configurable backends, and structured inputs.
---

# Open Interpreter

The Open Interpreter provider runs the Rust `interpreter app-server` locally through Promptfoo's app-server bridge. It targets Open Interpreter `rust-v0.0.21` or later; the legacy `open-interpreter` Python package uses a different API and is not supported.

## Installation and Quick Start

Install the CLI separately, make its executable available, and set the credential required by the selected backend:

```bash
curl -fsSL https://www.openinterpreter.com/install | sh
interpreter --version
export OPENAI_API_KEY=your_api_key_here
```

The provider accepts `openinterpreter` and `openinterpreter:<model>`. The optional model suffix takes precedence over `config.model`.

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Read-only Open Interpreter eval

prompts:
  - 'Read README.md and summarize the project in one sentence.'

providers:
  - id: openinterpreter:gpt-5.4
    config:
      working_dir: ./workspace
      skip_git_repo_check: true
      sandbox_mode: read-only
      turn_timeout_ms: 120000

tests:
  - assert:
      - type: contains
        value: project
```

The example workspace is intentionally not a Git repository, so `skip_git_repo_check: true` is required. Run the eval with fresh results and export them for inspection:

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache -o output.json
```

## Safety Defaults

Open Interpreter can run commands and change files. Promptfoo uses an isolated home and, when `working_dir` is omitted, a separate empty temporary workspace for every row. Temporary workspaces and child processes are removed after each row; the temporary home is removed at the end of the eval.

| Setting               | Default     | Effect                                                                |
| --------------------- | ----------- | --------------------------------------------------------------------- |
| `sandbox_mode`        | `read-only` | Prevents writes from the agent runtime.                               |
| `approval_policy`     | `untrusted` | Requests approval for commands outside the trusted set.               |
| `ephemeral`           | `true`      | Keeps new runtime threads ephemeral.                                  |
| `reuse_server`        | `false`     | Starts a fresh app-server process for each row.                       |
| `inherit_process_env` | `false`     | Passes a minimal process environment and configured credentials only. |
| `turn_timeout_ms`     | `120000`    | Interrupts turns that do not finish within two minutes.               |

Command/file approvals, permission grants, user-input requests, and MCP elicitations are declined or answered with an empty value unless configured. The provider disables analytics, feedback, and runtime memories by default; an explicit `cli_config` value can opt in.

:::warning
`workspace-write`, accepted approvals, inherited environment variables, live network access, and especially `danger-full-access` can expose credentials or modify the host. Use a disposable workspace or an external sandbox. The runtime sandbox is not a security boundary for hostile models.
:::

## Configuration

Provider-level and prompt-level config are validated strictly, so misspelled options fail before the runtime starts. Relative workspace, home, and executable paths resolve from the directory containing the Promptfoo config; a bare `interpreter_path` still uses `PATH` lookup.

| Parameter                | Type          | Description                                                                                          |
| ------------------------ | ------------- | ---------------------------------------------------------------------------------------------------- |
| `interpreter_path`       | string        | `interpreter` executable path or bare executable name.                                               |
| `interpreter_home`       | string        | Existing authenticated/configured home. Defaults to an isolated temporary home.                      |
| `model`                  | string        | Model passed to Open Interpreter.                                                                    |
| `model_provider`         | string        | Backend ID such as `openai`, `anthropic`, `openrouter`, `ollama`, or `lmstudio`.                     |
| `apiKey`                 | string        | Explicit API key. Prefer an environment variable.                                                    |
| `base_url`               | string        | OpenAI-compatible base URL.                                                                          |
| `working_dir`            | string        | Agent workspace. Defaults to a new empty temporary directory for each row.                           |
| `additional_directories` | string[]      | Additional workspace roots.                                                                          |
| `skip_git_repo_check`    | boolean       | Permit a non-Git workspace. Automatically enabled only for generated temporary workspaces.           |
| `sandbox_mode`           | string        | `read-only`, `workspace-write`, or `danger-full-access`.                                             |
| `approval_policy`        | string/object | `untrusted`, `on-request`, `never`, legacy `on-failure`, or a granular app-server policy.            |
| `server_request_policy`  | object        | Deterministic command/file approval, permission, user-input, MCP, and dynamic-tool responses.        |
| `network_access_enabled` | boolean       | Enables runtime network access when supported by the sandbox policy.                                 |
| `harness`                | string        | Built-in or custom harness name. Use `native` to explicitly select the native harness.               |
| `harness_guidance`       | boolean       | Include the selected harness reliability guidance.                                                   |
| `model_reasoning_effort` | string        | Runtime-supported reasoning level.                                                                   |
| `reasoning_summary`      | string        | `auto`, `concise`, `detailed`, or `none`.                                                            |
| `output_schema`          | object        | JSON Schema for the final response.                                                                  |
| `thread_id`              | string        | Resume an explicitly selected saved thread.                                                          |
| `persist_threads`        | boolean       | Reuse matching threads. Requires `working_dir` and automatically enables server reuse.               |
| `thread_pool_size`       | number        | Maximum cached persistent-thread count.                                                              |
| `ephemeral`              | boolean       | Keep the runtime thread ephemeral. Defaults to `false` when resuming `thread_id`.                    |
| `cli_config`             | object        | Native TOML config overrides, passed as individual `-c key=value` arguments and deep-merged per row. |
| `cli_env`                | object        | Explicit environment variables for the child process and its tools.                                  |
| `inherit_process_env`    | boolean       | Forward the complete Promptfoo process environment.                                                  |
| `reuse_server`           | boolean       | Reuse the app-server process across rows. Cannot be `false` with `persist_threads: true`.            |
| `request_timeout_ms`     | number        | JSON-RPC request timeout.                                                                            |
| `startup_timeout_ms`     | number        | App-server initialization timeout.                                                                   |
| `turn_timeout_ms`        | number        | Overall turn timeout.                                                                                |
| `include_raw_events`     | boolean       | Include sanitized protocol notifications in `raw`.                                                   |

Built-in harnesses in the pinned runtime are `claude-code`, `claude-code-bare`, `deepseek-tui`, `kimi-code`, `kimi-cli`, `zcode`, `little-coder`, `mini-swe-agent`, `opencode`, `pi`, `qwen-code`, `swe-agent`, `terminus-2`, and `minimal`. Custom names are forwarded unchanged. `native` is translated to the runtime's empty harness value so it does not become an unintended custom harness.

For a configured backend, pass only its required credential:

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

Credentials in `cli_env` are visible to commands executed by the agent. To test writes, use a disposable workspace, set `sandbox_mode: workspace-write`, and explicitly accept the relevant approvals:

```yaml
providers:
  - id: openinterpreter:gpt-5.4
    config:
      working_dir: ./disposable-workspace
      skip_git_repo_check: true
      sandbox_mode: workspace-write
      server_request_policy:
        command_execution: accept
        file_change: accept
```

## Prompt Inputs and Results

Plain prompts work as usual. Chat-message arrays are converted to a role-labelled prompt without interpreting message content. Structured text, local-image, skill, and mention inputs are also supported:

```json
[
  { "type": "text", "text": "Review this screenshot." },
  { "type": "local_image", "path": "screenshots/failure.png" }
]
```

Local input paths must exist and, including symlink targets, remain within `working_dir` or `additional_directories`; Promptfoo forwards their validated absolute paths to the runtime. Virtual `app://` and `plugin://` mention targets are forwarded unchanged. The pinned runtime does not support HTTP(S) image URLs. Use an inline `data:` URL instead; combined inline image input is limited to 5,000,000 characters.

The final assistant response is returned as `output`, reported usage is recorded in `tokenUsage`, and the thread is returned as `sessionId`. Sanitized trajectories, approval decisions, item counts, and turn IDs are available under `providerResponse.metadata.openInterpreter`; `raw.items` remains available for coding-agent assertions. Individual protocol messages and total streamed events are bounded, and an overflowing child process is terminated promptly.

If startup fails, verify `interpreter --version` and `interpreter app-server --help`, then set `interpreter_path` if necessary. If authentication fails, check the selected backend credential or set `interpreter_home`. If a disposable workspace is rejected, set `skip_git_repo_check: true`; do not disable that check for a real repository by accident. Increase `turn_timeout_ms` only for genuinely long tasks.

See the runnable [Open Interpreter example](https://github.com/promptfoo/promptfoo/tree/main/examples/openinterpreter) and the [coding-agent eval guide](/docs/guides/evaluate-coding-agents).
