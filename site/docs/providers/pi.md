---
sidebar_position: 43
title: Pi Coding Agent
description: 'Run evals through Pi, a minimal terminal coding agent with multi-provider model support, tool use, thinking levels, and per-message token and cost reporting'
---

# Pi Coding Agent

This provider integrates [Pi](https://pi.dev/), a minimal terminal coding agent that supports Anthropic, OpenAI, Google, Groq, OpenRouter, and many other LLM providers.

Promptfoo runs the `pi` CLI in one-shot JSON mode for each test case, so evals exercise the same agent runtime users get in their terminal.

## Provider IDs

- `pi` - Uses pi's configured default model
- `pi:<provider>/<model>` - Explicit model (e.g. `pi:anthropic/claude-sonnet-4-5`, `pi:openai/gpt-5.4-mini`)

The model segment accepts pi's model patterns, including an optional thinking-level suffix such as `pi:openai/gpt-5.2:high`.

## Installation

Install the pi CLI with one of:

```bash
npm install -g @earendil-works/pi-coding-agent
```

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

Or install it into your project, where promptfoo resolves it automatically:

```bash
npm install @earendil-works/pi-coding-agent
```

Pi requires Node.js 22.19 or newer.

:::note

On Windows, use the project-local install (or set `pi_path` to the package's `dist/cli.js`): promptfoo runs the package script with Node directly, while a globally installed `pi.cmd` shim on PATH cannot be spawned without a shell.

:::

## Setup

Configure credentials for your LLM provider. Pi reads the standard environment variables:

```bash
export ANTHROPIC_API_KEY=your_api_key_here
# or OPENAI_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, ...
```

Subscription auth (such as Claude Pro/Max via `pi /login`) also works because the provider uses your pi config directory (`~/.pi/agent`) by default.

## Quick Start

```yaml title="promptfooconfig.yaml"
providers:
  - pi:openai/gpt-5.4-mini

prompts:
  - 'Write a Python function that validates email addresses'
```

By default the agent runs in a temporary directory with all tools disabled (chat-only), and nothing is written to pi's session history.

### With Working Directory

Specify a working directory to enable read-only file tools:

```yaml
providers:
  - id: pi:anthropic/claude-sonnet-4-5
    config:
      working_dir: ./src
```

With a working directory, pi gets the read-only tools `read`, `grep`, `find`, and `ls`. Relative `working_dir` values are resolved from the directory containing the config file.

### With Side Effects

Pi has no built-in permission or sandbox system, so write access is opt-in:

```yaml
providers:
  - id: pi:anthropic/claude-sonnet-4-5
    config:
      working_dir: ./sandbox
      tools: [read, bash, edit, write, grep, find, ls]
```

:::warning

With `bash`, `edit`, or `write` enabled, the agent executes commands and modifies files directly with your user's privileges. The pi process also inherits promptfoo's full environment, including any secrets in it. When evaluating untrusted prompts with tools enabled, run inside a container or a shell with a stripped environment.

:::

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
| `agent_dir`             | `string`   | `~/.pi/agent` | Pi config directory (sets `PI_CODING_AGENT_DIR`)                                              |
| `pi_path`               | `string`   | auto          | Path to the pi executable                                                                     |
| `env`                   | `object`   | -             | Extra environment variables for the pi process                                                |
| `extra_args`            | `string[]` | -             | Additional CLI arguments (escape hatch; included in the cache key, so never put secrets here) |
| `timeout`               | `number`   | `600000`      | Maximum run time per call in milliseconds                                                     |
| `offline`               | `boolean`  | `true`        | Pass `--offline` to skip pi's startup version checks and telemetry (LLM calls are unaffected) |
| `max_output_bytes`      | `number`   | `33554432`    | Cap on retained stdout before the run is aborted (guards against runaway/large tool output)   |

Extension, skill, prompt-template, and context-file discovery are disabled by default so eval prompts are processed verbatim and results stay reproducible. Re-enable them to evaluate your customized pi setup.

## Response Format

The provider returns:

- `output` - Final assistant message text
- `tokenUsage` - Tokens summed across all assistant turns (`prompt`, `completion`, `total`, `cached`, `numRequests`)
- `cost` - USD cost as reported by pi
- `metadata.toolCalls` - Tools the agent invoked, with arguments and error status
- `metadata.model` / `metadata.provider_id` - Model that actually served the run
- `raw` - JSON of all assistant messages

## Caching

Responses are cached using the prompt, CLI arguments, a fingerprint of the working directory contents, the configured provider environment (`env` and provider overrides), and a fingerprint of the agent dir's `settings.json` / `models.json`. Changing a base URL, a behavior-affecting env value, or pi's default model therefore busts the cache, while changing only the API key does not (the credential is excluded so cached results stay portable). Only hashes are persisted, so no secret or file content reaches the cache. Use `--no-cache` during development:

```bash
promptfoo eval --no-cache
```

:::note

pi resolves credentials in the order `--api-key` flag > `~/.pi/agent/auth.json` > environment variables. This provider injects `apiKey` via the environment (never argv, to keep it out of process listings and the cache key), so a stored `auth.json` credential for the same provider takes precedence over `config.apiKey`. Set a dedicated `agent_dir` (or remove the stored credential) when you need `apiKey` to win.

:::

## Comparing Models Through Pi

Because pi is multi-provider, one config can compare how the same agent harness performs across models:

```yaml title="promptfooconfig.yaml"
providers:
  - pi:openai/gpt-5.4-mini
  - pi:anthropic/claude-sonnet-4-5
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
