---
sidebar_position: 43
title: Pi Coding Agent
description: 'Run evals through Pi, a minimal terminal coding agent with multi-provider model support, tool use, thinking levels, and per-message token and cost reporting'
---

# Pi Coding Agent

This provider integrates [Pi](https://pi.dev/), a minimal terminal coding agent that can run against the model providers configured in Pi.

Promptfoo starts the `pi` CLI for each test case, sends the prompt over RPC, and closes the process after the run completes. Prompts retain their leading and trailing whitespace.

## Provider IDs

- `pi` - Uses pi's configured default model
- `pi:<provider>/<model>` - Explicit model (for example `pi:anthropic/claude-sonnet-4-6` or `pi:openai/gpt-5.5`)

The model segment follows Pi's model pattern syntax, including an optional thinking-level suffix such as `pi:openai/gpt-5.5:high`. Run `pi --list-models` to see the models available in your Pi install.

## Installation

The Pi provider supports Linux and macOS. Windows is not supported.

Install Pi into the project where you run promptfoo. Automatic discovery searches that directory and its parents:

```bash
npm install --ignore-scripts @earendil-works/pi-coding-agent
```

For an existing installation elsewhere, set `pi_path` to the absolute path of its executable or CLI script. Promptfoo does not search `PATH` or the configured working directory.

Use Pi 0.99.1 or later, which supports the RPC completion event required by this provider.

## Setup

Configure credentials for the Pi provider you select. For API-key providers, Pi reads standard environment variables:

```bash
export OPENAI_API_KEY=your_api_key_here
# or ANTHROPIC_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, ...
```

Subscription-backed providers configured through Pi's login flow also work because the provider uses your Pi config directory (`~/.pi/agent`) by default.

An explicit `apiKey` uses `api_key_env` or the vendor selected in the provider configuration. A per-test model override does not move that key to another vendor’s environment variable.

## Quick Start

```yaml title="promptfooconfig.yaml"
providers:
  # Replace with any model returned by `pi --list-models`.
  - pi:openai/gpt-5.5

prompts:
  - 'Write a Python function that validates email addresses'
```

If you use Pi's OpenAI Codex provider, authenticate through Pi's login flow and select the Codex provider explicitly:

```yaml
providers:
  - pi:openai-codex/gpt-5.5
```

By default the agent runs in a temporary directory with all tools disabled (chat-only), and nothing is written to pi's session history.

### With Working Directory

Specify a working directory to enable read-only file tools:

```yaml
providers:
  - id: pi:anthropic/claude-sonnet-4-6
    config:
      working_dir: ./src
```

With a working directory, pi gets the read-only tools `read`, `grep`, `find`, and `ls`. Relative `working_dir` values are resolved from the directory containing the config file.

:::warning

pi does not sandbox these tools to `working_dir` — `read`/`grep`/`find` accept parent and absolute paths, so an adversarial prompt could read files outside it (e.g. `~/.aws/credentials`, dotfiles) into the model output. For evals with untrusted prompts, run pi inside a container or set `working_dir` in an isolated environment. Pass `no_tools: true` (or an empty `tools: []`) to keep a working directory chat-only.

:::

### With Side Effects

Pi has no built-in permission or sandbox system, so write access is opt-in:

```yaml
providers:
  - id: pi:anthropic/claude-sonnet-4-6
    config:
      working_dir: ./sandbox
      tools: [read, bash, edit, write, grep, find, ls]
```

:::warning

With `bash`, `edit`, or `write` enabled, the agent executes commands and modifies files directly with your user's privileges. The pi process also inherits promptfoo's full environment, including any secrets in it. When evaluating untrusted prompts with tools enabled, run inside a container or a shell with a stripped environment.

:::

Prompt and test options may override `model` and `thinking`. Executable, tool, path,
environment, resource discovery, and timeout settings come from the provider configuration.
Automatic `copy_working_dir` workspaces are not supported. Use an explicitly isolated
`working_dir` when a run needs its own files. Pi is not an `agent-rubric` grader
because it cannot receive the target’s copied workspace through this integration.

## Configuration

| Option                  | Type       | Default       | Description                                                                                   |
| ----------------------- | ---------- | ------------- | --------------------------------------------------------------------------------------------- |
| `model`                 | `string`   | pi default    | Model pattern passed to `--model` (`provider/id`, optional `:<thinking>` suffix)              |
| `provider_id`           | `string`   | -             | Provider name passed to `--provider`; unnecessary when `model` uses the `provider/id` form    |
| `thinking`              | `string`   | -             | Thinking level: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`                            |
| `apiKey`                | `string`   | env vars      | API key for the selected provider, injected via its standard env var                          |
| `api_key_env`           | `string`   | -             | Env var name that carries `apiKey` (required for providers promptfoo does not recognize)      |
| `working_dir`           | `string`   | temp dir      | Directory pi operates in; enables read-only tools                                             |
| `tools`                 | `string[]` | see above     | Tool allowlist (`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`, plus extension tools)  |
| `exclude_tools`         | `string[]` | -             | Tool denylist                                                                                 |
| `no_tools`              | `boolean`  | -             | Disable all tools                                                                             |
| `system_prompt`         | `string`   | pi default    | Replace pi's system prompt                                                                    |
| `append_system_prompt`  | `string`   | -             | Append to pi's system prompt                                                                  |
| `load_extensions`       | `boolean`  | `false`       | Load pi extensions from the agent dir and working dir                                         |
| `load_skills`           | `boolean`  | `false`       | Load pi skills                                                                                |
| `load_prompt_templates` | `boolean`  | `false`       | Expand pi prompt templates in prompts                                                         |
| `load_context_files`    | `boolean`  | `false`       | Load AGENTS.md / CLAUDE.md from the working directory                                         |
| `trust_project_files`   | `boolean`  | `false`       | Trust project-local pi files (`--approve`): `.pi/settings.json`, project extensions/SYSTEM.md |
| `agent_dir`             | `string`   | `~/.pi/agent` | Pi config directory (sets `PI_CODING_AGENT_DIR`)                                              |
| `pi_path`               | `string`   | auto          | Absolute path to the pi executable or CLI script                                              |
| `env`                   | `object`   | -             | Extra environment variables for the pi process                                                |
| `extra_args`            | `string[]` | -             | Additional CLI arguments; use `apiKey` or `env` for credentials                               |
| `timeout`               | `number`   | `600000`      | Maximum run time per call in milliseconds                                                     |
| `offline`               | `boolean`  | `true`        | Pass `--offline` to skip pi's startup version checks and telemetry (LLM calls are unaffected) |
| `max_output_bytes`      | `number`   | `33554432`    | Cap on retained stdout before the run is aborted (guards against runaway/large tool output)   |

Extension, skill, prompt-template, and context-file discovery are disabled by default. The provider also passes `--no-approve`, so project-local pi files (a `.pi/settings.json`, project extensions, or a `.pi/SYSTEM.md` in the `working_dir`) are ignored even if the project was previously trusted. Discovery (`load_*`) and trust are independent: context files load without trust, while project-local extensions/skills/templates and `.pi/SYSTEM.md` require `trust_project_files: true` (`--approve`). Enabling project trust applies to every project-local Pi file, including a `settings.json` that can change the model.

## Response Format

The provider returns:

- `output` - Final assistant message text
- `tokenUsage` - Tokens summed across the final run's assistant turns (`prompt`, `completion`, `total`, `cached`, `numRequests`); cache reads/writes are exposed as `completionDetails.cacheReadInputTokens` and `completionDetails.cacheCreationInputTokens` when pi reports them
- `cost` - USD cost as reported by pi
- `metadata.toolCalls` - Tools the agent invoked, with arguments and error status
- `finishReason` - Why the final assistant response stopped (`stop`, `length`, or `tool_calls`)
- `metadata.model` / `metadata.provider_id` - Model that actually served the run
- `raw` - JSON of all assistant messages

If pi auto-retries after a transient provider/runtime error, `tokenUsage` and `cost` reflect the final (successful) attempt; tokens spent on the discarded failed attempts are not included.

## Caching

Responses are not cached. Each call starts Pi again because its output can depend on files, environment variables, and runtime settings outside the configured working directory.

:::note

Child processes inherit values from the eval’s environment file. Provider `env` settings override those values. `PI_CODING_AGENT_DIR` can also be supplied through the shared provider `env` settings. Relative working and agent directories use the provider’s configuration directory, including when a loaded provider is called later.

pi resolves credentials in the order `--api-key` flag > `~/.pi/agent/auth.json` > environment variables. This provider injects `apiKey` via the environment (never argv, to keep it out of process listings and debug logs), so a stored `auth.json` credential for the same provider takes precedence over `config.apiKey`. Set a dedicated `agent_dir` (or remove the stored credential) when you need `apiKey` to win.

:::

## Tracing

When [tracing](/docs/tracing/) is enabled, each call emits a GenAI span with model, token usage, and cost, linked through `traceparent`. Pi does not expose native OpenTelemetry spans for its internal work.

## Comparing Models Through Pi

Because pi is multi-provider, one config can compare how the same agent harness performs across models:

```yaml title="promptfooconfig.yaml"
providers:
  # Replace these IDs with models returned by `pi --list-models`.
  - pi:openai/gpt-5.5
  - pi:anthropic/claude-sonnet-4-6
  - pi:google/gemini-2.5-flash

prompts:
  - 'Implement a binary search function in Python with tests'
```

## See Also

- [Claude Agent SDK](/docs/providers/claude-agent-sdk/) - Anthropic's coding agent
- [OpenAI Codex SDK](/docs/providers/openai-codex-sdk/) - OpenAI's coding agent
- [OpenCode SDK](/docs/providers/opencode-sdk/) - Multi-provider coding agent with a client/server architecture
- [Agentic SDK comparison example](https://github.com/promptfoo/promptfoo/tree/main/examples/compare-agentic-sdks) - Pi vs Codex vs Claude Agent SDK vs OpenCode on one task
- [Pi documentation](https://pi.dev/docs)
