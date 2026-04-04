---
sidebar_position: 41
title: OpenAI Codex SDK
description: 'Use OpenAI Codex SDK for evals with thread management, structured output, and Git-aware operations'
---

# OpenAI Codex SDK

This provider makes OpenAI's Codex SDK available for agent evals in promptfoo. It can evaluate Codex's final response text, token usage, thread/session IDs, heuristic skill usage, and traced shell/MCP/search/file steps. It accepts plain text prompts and JSON-encoded Codex input arrays with `text` and `local_image` items, but it does not expose embeddings, moderation, image generation, or realtime APIs.

The provider runs Codex with an explicit working directory, sandbox policy, approval policy, network/search settings, and a controlled CLI environment. The model output returned to promptfoo is the final Codex text response; if you request JSON schema output, `output` is still a string and your assertions should parse it with `is-json` or `JSON.parse(output)`.

:::note

Promptfoo declares `@openai/codex-sdk` as an optional dependency. If your installation omits optional packages or you are running from a source checkout before `npm ci`, install the SDK package manually.

:::

## Provider IDs

You can reference this provider using either base ID, and you can inline the model in the provider path:

- `openai:codex-sdk` or `openai:codex-sdk:<model name>` (full name)
- `openai:codex` or `openai:codex:<model name>` (alias)

## What Promptfoo Can and Can't Evaluate

| Eval surface                       | Supported? | Notes                                                                                                                                                                                                                                                                         |
| ---------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Final assistant text               | Yes        | Returned in `response.output` as a string.                                                                                                                                                                                                                                    |
| Text + local image prompt inputs   | Partial    | Pass plain text as usual, or pass a JSON array of `{"type":"text","text":"..."}` and `{"type":"local_image","path":"/abs/file.png"}` entries. Other JSON prompt shapes are treated as plain text.                                                                             |
| JSON schema output                 | Yes        | Pass `output_schema`; use `is-json` and `JSON.parse(output)` in JS assertions because the provider does not auto-parse the final text.                                                                                                                                        |
| Token usage and estimated cost     | Yes        | `tokenUsage` is returned when the SDK reports usage. Cost is estimated only when `config.model` is known to promptfoo's pricing table. Codex's own instruction preamble and tool schemas are included in prompt tokens, so tiny prompts can still report high `input_tokens`. |
| Session/thread IDs                 | Yes        | `sessionId` is returned from the underlying Codex thread.                                                                                                                                                                                                                     |
| Shell/MCP/search/file trajectories | Yes        | Enable `enable_streaming` for provider-level spans. Enable `deep_tracing` to propagate OTEL context into the Codex CLI process.                                                                                                                                               |
| Skill usage assertions             | Partial    | `skill-used` relies on heuristic detection of direct `SKILL.md` command reads, not a first-class SDK skill event.                                                                                                                                                             |
| Multi-turn thread persistence      | Partial    | `persist_threads` pools by prompt template + config, not by rendered prompt values. `deep_tracing` disables thread persistence.                                                                                                                                               |
| Embeddings/moderation/image APIs   | No         | Use the standard `openai:*` providers for those API surfaces.                                                                                                                                                                                                                 |
| Live partial-token streaming       | No         | `enable_streaming` is used to aggregate Codex events and emit traces; promptfoo still receives the final response after the turn completes.                                                                                                                                   |
| Sampling knobs                     | Limited    | `model_reasoning_effort` is supported. Direct `temperature`, `top_p`, `max_tokens`, `stop`, and `logprobs` are not exposed by this provider.                                                                                                                                  |

## Installation

The OpenAI Codex SDK provider requires the `@openai/codex-sdk` package to be installed separately:

```bash
npm install @openai/codex-sdk
```

Use Node.js `^20.20.0` or `>=22.22.0`, which matches promptfoo's repo/runtime requirement and the provider's loader checks.

:::note

This package is optional and only needed for the OpenAI Codex SDK provider. The published `@openai/codex-sdk` and `@openai/codex` packages currently declare the Apache-2.0 license.

:::

## Setup

The Codex SDK can authenticate with either an existing Codex/ChatGPT login or an API key.

### Option 1: Use your ChatGPT login

Sign in through the Codex CLI first:

```bash
codex
```

Then follow the sign-in flow with ChatGPT. When `apiKey`, `OPENAI_API_KEY`, and `CODEX_API_KEY` are all unset, promptfoo's `openai:codex-sdk` provider lets the Codex SDK reuse that existing login state.

If you override `cli_env.CODEX_HOME`, that directory must contain a valid Codex login state for ChatGPT-authenticated runs. Otherwise, set `apiKey`, `OPENAI_API_KEY`, or `CODEX_API_KEY`.

See OpenAI's [Using Codex with your ChatGPT plan](https://help.openai.com/en/articles/11369540) for the current supported Codex login flow.

### Option 2: Use an API key

Set your OpenAI API key with the `OPENAI_API_KEY` environment variable or specify the `apiKey` in the provider configuration.

Create OpenAI API keys [here](https://platform.openai.com/api-keys).

Example of setting the environment variable:

```sh
export OPENAI_API_KEY=your_api_key_here
```

Alternatively, you can use the `CODEX_API_KEY` environment variable:

```sh
export CODEX_API_KEY=your_api_key_here
```

:::note

ChatGPT login support is specific to the Codex SDK provider. Other `openai:*` providers in promptfoo still use Platform API credentials, and [ChatGPT subscriptions are billed separately from API usage](https://help.openai.com/en/articles/8156019).

:::

## Quick Start

### Basic Usage

By default, the Codex SDK runs in the current working directory and requires that directory to be inside a Git repository unless you disable the check. For pure code-generation evals that should not touch the filesystem, use `sandbox_mode: read-only`.

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:codex-sdk
    config:
      sandbox_mode: read-only

prompts:
  - 'Write a Python function that calculates the factorial of a number'
```

The provider creates an ephemeral thread for each eval test case.

### With Custom Model

Specify which OpenAI model to use for code generation:

```yaml title="promptfooconfig.yaml"
providers:
  - openai:codex:gpt-5.4

prompts:
  - 'Write a TypeScript function that validates email addresses'
```

If you need additional Codex settings, you can still set the model via `config.model`:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      model: gpt-5.4
```

### With Working Directory

Specify a custom working directory for the Codex SDK to operate in. The directory can be a repository subdirectory as long as one of its parent directories contains `.git`:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:codex-sdk
    config:
      working_dir: ./src

prompts:
  - 'Review the codebase and suggest improvements'
```

This allows you to prepare a directory with files before running your tests.

### Skipping Git Check

If you need to run in a non-Git directory, you can bypass the Git repository requirement:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:codex-sdk
    config:
      working_dir: ./temp-workspace
      skip_git_repo_check: true

prompts:
  - 'Generate a README file for this project'
```

:::warning

Skipping the Git check removes a safety guard. Use with caution and consider version control for any important code.

:::

## Supported Parameters

The provider validates top-level provider config strictly. If you mistype a provider field such as `sandboxMode` instead of `sandbox_mode`, provider loading can fail before any rows run. Prompt-level config is parsed more leniently because promptfoo merges generic test options into `prompt.config`; unrelated keys are ignored there, while invalid values for known Codex fields still return a row-level provider error. Put extra Codex CLI settings that are not listed below under `cli_config`.

| Parameter                | Type     | Description                                                  | Default              |
| ------------------------ | -------- | ------------------------------------------------------------ | -------------------- |
| `apiKey`                 | string   | OpenAI API key. Optional when Codex is already signed in.    | Environment variable |
| `base_url`               | string   | Custom API base URL                                          | None                 |
| `working_dir`            | string   | Directory for Codex to operate in                            | Current directory    |
| `additional_directories` | string[] | Additional directories the agent can access                  | None                 |
| `model`                  | string   | Model to use                                                 | SDK default          |
| `sandbox_mode`           | string   | Sandbox access level (see below)                             | `workspace-write`    |
| `model_reasoning_effort` | string   | Reasoning intensity (see below)                              | SDK default          |
| `network_access_enabled` | boolean  | Allow network requests                                       | false                |
| `web_search_enabled`     | boolean  | Allow web search                                             | false                |
| `web_search_mode`        | string   | Web search mode: `disabled`, `cached`, or `live`             | SDK default          |
| `collaboration_mode`     | string   | Multi-agent preset mapped to `cli_config.collaboration_mode` | None                 |
| `approval_policy`        | string   | When to require approval (see below)                         | SDK default          |
| `cli_config`             | object   | Additional Codex CLI config overrides                        | None                 |
| `skip_git_repo_check`    | boolean  | Skip Git repository validation                               | false                |
| `codex_path_override`    | string   | Custom path to codex binary                                  | None                 |
| `thread_id`              | string   | Resume existing thread from ~/.codex/sessions                | None (creates new)   |
| `persist_threads`        | boolean  | Keep threads alive between calls                             | false                |
| `thread_pool_size`       | number   | Max concurrent threads (when persist_threads)                | 1                    |
| `output_schema`          | object   | JSON schema for structured responses                         | None                 |
| `cli_env`                | object   | Custom environment variables for Codex CLI                   | Minimal shell env    |
| `inherit_process_env`    | boolean  | Merge full process env into the Codex CLI env                | `false`              |
| `enable_streaming`       | boolean  | Enable streaming events                                      | false                |
| `deep_tracing`           | boolean  | Enable OpenTelemetry tracing of CLI internals                | false                |

### Sandbox Modes

The `sandbox_mode` parameter controls filesystem access only:

- `read-only` - Agent can only read files (safest)
- `workspace-write` - Agent can write to working directory (default)
- `danger-full-access` - Agent has full filesystem access (use with caution)

Network access and shell environment inheritance are configured separately with `network_access_enabled`, `web_search_mode`, `web_search_enabled`, `cli_env`, and `inherit_process_env`. A restrictive filesystem sandbox does not automatically remove environment variables, and enabling `danger-full-access` does not automatically enable web/network access.

### Approval Policies

The `approval_policy` parameter controls when user approval is required:

- `never` - Never require approval
- `on-request` - Require approval when requested
- `on-failure` - Require approval after failures
- `untrusted` - Require approval for untrusted operations

## Models

The SDK supports various OpenAI models. Use `gpt-5.4` for the latest frontier model:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      model: gpt-5.4 # Recommended for code tasks
```

Supported models include:

- **GPT-5.4** - Frontier model for professional work (`gpt-5.4`)
- **GPT-5.4 Pro** - Higher-capacity variant (`gpt-5.4-pro`)
- **GPT-5.3 Codex** - Latest codex generation (`gpt-5.3-codex`, `gpt-5.3-codex-spark`)
- **GPT-5.2** - Current GPT-5.2 line (`gpt-5.2`, `gpt-5.2-codex`)
- **GPT-5.1 Codex** - Optimized for code generation (`gpt-5.1-codex`, `gpt-5.1-codex-max`, `gpt-5.1-codex-mini`)
- **GPT-5 Codex** - Previous generation (`gpt-5-codex`, `gpt-5-codex-mini`)
- **GPT-5** - Base GPT-5 model (`gpt-5`)

If you omit `config.model`, the Codex CLI may choose an internal default model alias and the backend may resolve that alias to a different concrete model. The current Codex SDK turn payload exposed to Promptfoo includes `items`, `finalResponse`, and `usage`, but not the backend-resolved model name, so tracing and cost attribution use the requested `config.model` when present and otherwise fall back to the provider's generic `codex` label with `response.cost: 0`.

### Mini Models

For faster or lower-cost evals, use mini model variants:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      model: gpt-5.1-codex-mini
```

## Thread Management

The Codex SDK uses thread-based conversations stored in `~/.codex/sessions`. Promptfoo supports three thread management modes:

### Ephemeral Threads (Default)

Creates a new thread for each eval, then discards it:

```yaml
providers:
  - openai:codex-sdk
```

### Persistent Threads

Reuse threads between evals with the same prompt template and thread-affecting configuration:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      persist_threads: true
      thread_pool_size: 2 # Keep up to 2 prompt-template threads cached
```

Threads are pooled by cache key built from the prompt template (`prompt.raw` when available), working dir, model, output schema, sandbox/search/network/approval settings, and constructor-level SDK options. That means tests rendered from the same template with different vars share a thread, while different prompt templates get separate threads. If you call the provider directly without a `prompt.raw` context, the rendered prompt text becomes part of the cache key.

Thread persistence preserves conversation history; it does not keep prompt tokens flat. Later turns can report larger `input_tokens` because prior context is replayed, although `cached_input_tokens` may offset part of the cost. If row order matters for a multi-turn eval, run those test cases serially.

When the pool is full, the oldest thread is evicted.

Calls that target the same persisted thread are serialized inside the provider so concurrent eval workers do not issue overlapping `thread.run()` calls to one Codex thread. Calls with different thread cache keys can still run in parallel.

### Thread Resumption

Resume a specific thread by ID:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      thread_id: abc123def456 # Thread ID from ~/.codex/sessions
      persist_threads: true # Cache the resumed thread
```

## Structured Output

The Codex SDK supports JSON schema output. Specify an `output_schema` to get structured responses:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:codex-sdk
    config:
      output_schema:
        type: object
        properties:
          function_name:
            type: string
          parameters:
            type: array
            items:
              type: string
          return_type:
            type: string
        required:
          - function_name
          - parameters
          - return_type

prompts:
  - 'Describe the signature of a function that calculates fibonacci numbers'

tests:
  - assert:
      - type: is-json
      - type: javascript
        value: 'JSON.parse(output).function_name.includes("fibonacci")'
```

The output should be valid JSON matching your schema, but it is still returned as a string in `response.output`.

### Zod Schemas

You can also use Zod schemas converted with `zod-to-json-schema`:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      output_schema: file://schemas/function-signature.json
```

## Streaming

Enable streaming to receive progress events:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      enable_streaming: true
```

When streaming is enabled, the provider processes events like `item.completed` and `turn.completed` to build the final response and emit spans. Promptfoo still waits for the turn to finish before returning `response.output`; this setting does not provide a token-by-token callback stream to assertions.

## Tracing and Observability

The Codex SDK provider supports two levels of tracing:

### Streaming Mode Tracing

Enable `enable_streaming` to capture Codex operations as OpenTelemetry spans:

```yaml title="promptfooconfig.yaml"
tracing:
  enabled: true
  otlp:
    http:
      enabled: true
      port: 4318
      acceptFormats:
        - json

providers:
  - id: openai:codex-sdk
    config:
      enable_streaming: true
```

With streaming enabled, the provider creates spans for:

- **Provider-level calls** - Overall request timing and token usage
- **Agent responses** - Individual message completions
- **Reasoning steps** - Model reasoning captured in span events
- **Command executions** - Shell commands with exit codes and output
- **File changes** - File modifications with paths and change types
- **MCP tool calls** - External tool invocations

### Deep Tracing

To propagate OTEL context into the Codex CLI process and capture CLI-side spans when the installed Codex SDK supports them, enable `deep_tracing`:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      deep_tracing: true
      enable_streaming: true
```

Deep tracing injects OpenTelemetry environment variables (`OTEL_EXPORTER_OTLP_ENDPOINT`, `TRACEPARENT`, etc.) into the Codex CLI process. Promptfoo uses a fresh SDK client/thread per call in this mode so child spans link to the correct parent request span.

:::warning

Deep tracing is **incompatible with thread persistence**. When `deep_tracing: true`:

- `persist_threads`, `thread_id`, and `thread_pool_size` are ignored
- A fresh Codex instance is created for each call to ensure correct span linking

:::

:::warning

Promptfoo applies best-effort redaction to traced command text, command output, agent messages, reasoning text, MCP inputs, and MCP errors before attaching them to span attributes/events. Treat this as defense-in-depth, not a guarantee, and avoid placing production secrets in prompts or local files used by evals.

That sanitizer applies to spans promptfoo creates from Codex stream events. If `deep_tracing` causes the Codex CLI itself to emit native OTEL spans, those spans are produced outside promptfoo's sanitizer and may carry additional payloads.

:::

### Viewing Traces

Run your eval and view traces in your OTLP-compatible backend (Jaeger, Zipkin, etc.):

```bash
promptfoo eval -c promptfooconfig.yaml
```

## Git Repository Requirement

By default, the Codex SDK requires the working directory to be inside a Git repository. This prevents unrecoverable edits in throwaway directories.

The provider validates:

1. Working directory exists and is accessible
2. Working directory is a directory (not a file)
3. `.git` exists in the working directory or one of its parent directories

If validation fails, you'll see an error message.

To bypass this safety check:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      skip_git_repo_check: true
```

## Sandbox Mode

Control the level of filesystem access for the agent:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      sandbox_mode: read-only # Safest - agent can only read files
```

Available modes:

- `read-only` - Agent can only read files, no modifications allowed
- `workspace-write` - Agent can write to the working directory (default)
- `danger-full-access` - Full filesystem access (use with extreme caution)

Use `read-only` when you want to evaluate analysis or code-generation quality without allowing file writes. Use `workspace-write` when the task requires Codex to create or edit files under the working directory. Avoid `danger-full-access` unless the eval fixture is disposable and isolated.

## Web Search and Network Access

Enable the agent to search the web or make network requests:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      web_search_enabled: true # Allow web searches
      network_access_enabled: true # Allow network requests
```

For finer-grained web search control, prefer `web_search_mode`:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      web_search_mode: live # disabled | cached | live
```

If both `web_search_mode` and `web_search_enabled` are set, `web_search_mode` takes precedence.

:::warning

Enabling network access allows the agent to make arbitrary HTTP requests. Use with caution and only in trusted environments.

:::

## Collaboration Mode (Beta)

Enable multi-agent coordination where Codex can spawn and communicate with other agent threads:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      collaboration_mode: plan # or 'coding'
      enable_streaming: true # Recommended to see collaboration events
```

Available modes:

- `coding` - Focus on implementation and code execution
- `plan` - Focus on planning and reasoning before execution

When collaboration mode is enabled, the agent can use tools like `spawn_agent`, `send_input`, and `wait` to coordinate work across multiple threads.

:::note

Collaboration mode is a beta feature. `config.collaboration_mode` is merged into `cli_config.collaboration_mode`, and the top-level field wins if both are set. Some user-configured settings like `model` and `model_reasoning_effort` may still be overridden by Codex collaboration presets.

:::

## Model Reasoning Effort

Control how much reasoning the model uses:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      model_reasoning_effort: high # Thorough reasoning for complex tasks
```

Available levels vary by model:

| Level     | Description                          | Supported Models                                                               |
| --------- | ------------------------------------ | ------------------------------------------------------------------------------ |
| `minimal` | Minimal reasoning overhead           | gpt-5.4, gpt-5.2                                                               |
| `low`     | Light reasoning, faster responses    | All models                                                                     |
| `medium`  | Balanced (default)                   | All models                                                                     |
| `high`    | Thorough reasoning for complex tasks | All models                                                                     |
| `xhigh`   | Maximum reasoning depth              | gpt-5.4, gpt-5.4-pro, gpt-5.3-codex, gpt-5.2, gpt-5.2-codex, gpt-5.1-codex-max |

Promptfoo validates the allowed enum values, but model-specific support is ultimately enforced by the Codex SDK/runtime. If a value is not supported by the selected model, the provider returns a normal provider error row.

## Additional Directories

Allow the Codex agent to access directories beyond the main working directory:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      working_dir: ./src
      additional_directories:
        - ./tests
        - ./config
        - ./shared-libs
```

This is useful when the agent needs to read files from multiple locations, such as test files, configuration, or shared libraries.

## Custom Environment Variables

Pass custom environment variables to the Codex CLI:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      cli_env:
        CUSTOM_VAR: custom-value
        ANOTHER_VAR: another-value
```

By default, promptfoo now passes a minimal shell environment (`PATH`, `HOME`, `SHELL`, temp vars, locale vars, and similar OS basics), merges `cli_env`, and injects only the provider's resolved Codex/OpenAI API key from promptfoo-level env overrides. Other config-level `env:` keys are not forwarded to the Codex subprocess; pass those explicitly through `cli_env`. The provider emits a one-time warning if it sees non-auth promptfoo env overrides that are not present in `cli_env`. This keeps Codex agent commands isolated from unrelated process secrets while still leaving a usable shell path.

Common Codex home and certificate process variables such as `CODEX_HOME` and `SSL_CERT_FILE` are also omitted from that minimal default unless you set them in `cli_env` or enable `inherit_process_env: true`. If those variables are present in the parent process and not forwarded, the provider emits a one-time warning so custom-home or TLS-sensitive evals do not fail silently. SSH agent variables such as `SSH_AUTH_SOCK` and `GIT_SSH_COMMAND` are only included in that warning when network access or live web search is enabled.

To merge the full process environment anyway, set `inherit_process_env: true`:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      inherit_process_env: true
      cli_env:
        CODEX_HOME: ./sample-codex-home
```

## Skills

Codex loads [agent skills](https://developers.openai.com/codex/skills) from `.agents/skills/` directories in the `working_dir` hierarchy. Promptfoo does not enable skills via a provider-specific toggle; instead, you point `working_dir` at a repository that already contains the skill files you want Codex to discover.

Promptfoo exposes inferred skill usage in `response.metadata.skillCalls`. Each entry is derived from Codex command text that directly references a local `SKILL.md` file:

| Field    | Type   | Description                                           |
| -------- | ------ | ----------------------------------------------------- |
| `name`   | string | Skill name inferred from the `SKILL.md` path          |
| `path`   | string | Skill instruction file path read by Codex             |
| `source` | string | Evidence source. For Codex this is always `heuristic` |

```yaml title="promptfooconfig.yaml"
description: Codex skill eval

prompts:
  - 'Use the token-skill skill. Return only the token.'

providers:
  - id: openai:codex-sdk
    config:
      model: gpt-5.2
      working_dir: '{{ env.CODEX_SKILLS_WORKING_DIR | default("./sample-project") }}'
      skip_git_repo_check: true
      enable_streaming: true
      cli_env:
        CODEX_HOME: '{{ env.CODEX_HOME_OVERRIDE | default("./sample-codex-home") }}'

tests:
  - assert:
      - type: equals
        value: 'CERULEAN-FALCON-SKILL'
      - type: skill-used
        value: token-skill
```

The `CODEX_SKILLS_WORKING_DIR` and `CODEX_HOME_OVERRIDE` variables are optional. They are useful when you want to run the same config from a different current working directory, such as the repository root in CI.

:::note

`metadata.skillCalls` is a heuristic. The Codex SDK currently does not expose a first-class skill invocation event, so promptfoo infers skill usage from successful shell commands that directly reference `SKILL.md` files under `.agents/skills/<name>/`, absolute `working_dir/.agents/skills/<name>/` paths, the nearest git root's `.agents/skills/<name>/`, `CODEX_HOME/skills/<name>/`, `~/.codex/skills/<name>/`, or `/etc/codex/skills/<name>/`.

Wildcard paths such as `.agents/skills/*/SKILL.md` are ignored, and absolute `.agents/...` paths outside the active repo are ignored. `metadata.attemptedSkillCalls` is emitted only when promptfoo sees more candidate `SKILL.md` paths than confirmed successful reads; because this is heuristic metadata, attempted and successful lists can overlap when a skill path is retried.

:::

For reproducible CI runs, use `cli_env.CODEX_HOME` to point Codex at a project-local home directory. That isolates the eval from any personal Codex configuration or user-level skills on the machine.

For ChatGPT-login runs, that project-local `CODEX_HOME` must already contain auth state. The checked-in sample fixture intentionally does not, so either run those examples with an API key or set `CODEX_HOME_OVERRIDE="$HOME/.codex"` when you want to reuse your local Codex login.

Promptfoo also enriches traced Codex command spans with `promptfoo.skill.*` attributes when it detects skill reads. That makes it easier to debug routing in OTEL backends while keeping the main eval assertion surface on `skill-used`.

To trace what Codex does inside a skill, enable `deep_tracing` on the provider and root-level OTLP tracing in your config. That lets you assert on traced shell commands, MCP tool calls, search steps, and reasoning with the standard trace and trajectory assertions:

```yaml title="promptfooconfig.tracing.yaml"
description: Codex skill trace eval

prompts:
  - 'Use the token-skill skill. Return only the token.'

providers:
  - id: openai:codex-sdk
    config:
      model: gpt-5.2
      working_dir: '{{ env.CODEX_SKILLS_WORKING_DIR | default("./sample-project") }}'
      skip_git_repo_check: true
      enable_streaming: true
      deep_tracing: true
      cli_env:
        CODEX_HOME: '{{ env.CODEX_HOME_OVERRIDE | default("./sample-codex-home") }}'

tests:
  - assert:
      - type: contains
        value: 'CERULEAN-FALCON-SKILL'
      - type: trajectory:step-count
        value:
          type: command
          pattern: '*token-skill/SKILL.md*'
          min: 1
      - type: skill-used
        value: token-skill

tracing:
  enabled: true
  otlp:
    http:
      enabled: true
      port: 4318
      host: '127.0.0.1'
      acceptFormats: ['json']
```

Use `trajectory:step-count` for shell commands emitted while Codex is following the skill. If the skill triggers traced MCP calls, you can assert on those with `trajectory:tool-used` and `trajectory:tool-args-match`.

## Custom Binary Path

Override the default codex binary location:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      codex_path_override: /custom/path/to/codex
```

## Caching Behavior

This provider automatically caches responses based on:

- Prompt template (`prompt.raw`) when available; otherwise the rendered prompt text
- Working directory (if specified)
- Additional directories (if specified)
- Model name
- Output schema (if specified)
- Sandbox mode (if specified)
- Model reasoning effort (if specified)
- Network/web search settings (if specified)
- Approval policy (if specified)

To disable caching globally:

```bash
export PROMPTFOO_CACHE_ENABLED=false
```

To bust the cache for a specific test case, set `options.bustCache: true` in your test configuration:

```yaml
tests:
  - vars: {}
    options:
      bustCache: true
```

## Advanced Examples

### Multi-File Code Review

Review multiple files in a codebase with enhanced reasoning:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:codex-sdk
    config:
      working_dir: ./src
      sandbox_mode: read-only
      model_reasoning_effort: high # Use thorough reasoning for code review

prompts:
  - 'Review all TypeScript files in this directory and identify:
    1. Potential security vulnerabilities
    2. Performance issues
    3. Code style violations
    Return findings in JSON format'

tests:
  - assert:
      - type: is-json
      - type: javascript
        value: 'Array.isArray(JSON.parse(output).findings)'
```

### Structured Bug Report Generation

Generate structured bug reports from code:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:codex-sdk
    config:
      working_dir: ./test-code
      output_schema:
        type: object
        properties:
          bugs:
            type: array
            items:
              type: object
              properties:
                severity:
                  type: string
                  enum: [critical, high, medium, low]
                file:
                  type: string
                line:
                  type: number
                description:
                  type: string
                fix_suggestion:
                  type: string
              required:
                - severity
                - file
                - description
        required:
          - bugs

prompts:
  - 'Analyze the code and identify all bugs'
```

### Thread-Based Conversations

Use persistent threads for multi-turn conversations:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:codex-sdk
    config:
      persist_threads: true
      thread_pool_size: 1

tests:
  - vars:
      request: 'Create a User class'
  - vars:
      request: 'Add a method to validate email'
  - vars:
      request: 'Add proper type hints'

prompts:
  - '{{request}}'
```

Each test reuses the same thread, maintaining context.

This works because all three test cases render from the same prompt template (`{{request}}`), so the provider uses one prompt-template cache key when `persist_threads: true`.

## Unsupported Capabilities and Caveats

- This provider implements `callApi` only. It does not implement embeddings, classification, moderation, image, video, transcription, or realtime APIs.
- Prompt input arrays are supported only for Codex `text` and `local_image` items. Remote image URLs and other SDK item types are not forwarded by this provider.
- The provider returns a final response after the Codex turn completes. `enable_streaming` is for event aggregation and tracing, not live partial output in assertions.
- `output_schema` does not change the response type exposed to promptfoo assertions. `response.output` remains a string.
- `temperature`, `top_p`, `max_tokens`, `stop`, and `logprobs` are not exposed as first-class provider config fields.
- Cost is estimated only for known model names in the provider's pricing table. If you omit `config.model` or use an unknown model, `response.cost` is `0`.
- `persist_threads`, `thread_id`, and `thread_pool_size` are ignored when `deep_tracing: true`.
- `approval_policy: on-request` and similar interactive policies are usually a poor fit for unattended eval runs. Prefer `never` for deterministic CI unless you intentionally want approval-gated tool behavior.
- `skillCalls` and `attemptedSkillCalls` are heuristic and based on command text, not model-internal skill routing events.

## Comparison with Claude Agent SDK

Both providers support code operations, but have different features:

### OpenAI Codex SDK

- **Best for**: Code generation, structured output, reasoning tasks
- **Features**: JSON schema support, thread persistence, Codex models
- **Thread management**: Built-in pooling and resumption
- **Working directory**: Git repository validation
- **Configuration**: Focused on code tasks

### Claude Agent SDK

- **Best for**: File manipulation, system commands, MCP integration
- **Features**: Tool permissions, MCP servers, CLAUDE.md support
- **Thread management**: Temporary directory isolation
- **Working directory**: No Git requirement
- **Configuration**: More options for tool permissions and system access

Choose based on your use case:

- **Code generation & analysis** → OpenAI Codex SDK
- **System operations & tooling** → Claude Agent SDK

## Examples

See the [examples directory](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-codex-sdk) for complete implementations:

- [Basic usage](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-codex-sdk/basic) - Simple code generation
- [Skills testing](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-codex-sdk/skills) - Evaluate local Codex skills with `skill-used` and traced skill evidence
- [Thread persistence](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-codex-sdk/thread-persistence) - Reuse one prompt-template thread across multiple tests
- [Sandbox enforcement](https://github.com/promptfoo/promptfoo/tree/main/examples/openai-codex-sdk/sandbox) - Verify `read-only` mode blocks writes in a sample workspace
- [Agentic SDK comparison](https://github.com/promptfoo/promptfoo/tree/main/examples/compare-agentic-sdks) - Side-by-side comparison with Claude Agent SDK

### Verified end-to-end example runs

From the promptfoo repo root, these commands exercise the provider's skill inference, deep tracing, thread persistence, and sandbox enforcement paths.

```bash
# Basic local skill eval with a host Codex login
CODEX_SKILLS_WORKING_DIR="$PWD/examples/openai-codex-sdk/skills/sample-project" \
CODEX_HOME_OVERRIDE="$HOME/.codex" \
npm run local -- eval \
  -c examples/openai-codex-sdk/skills/promptfooconfig.yaml \
  --no-cache \
  -o /tmp/promptfoo-codex-skills.json

# Deep-tracing local skill eval with a host Codex login
CODEX_SKILLS_WORKING_DIR="$PWD/examples/openai-codex-sdk/skills/sample-project" \
CODEX_HOME_OVERRIDE="$HOME/.codex" \
npm run local -- eval \
  -c examples/openai-codex-sdk/skills/promptfooconfig.tracing.yaml \
  --no-cache \
  -o /tmp/promptfoo-codex-skills-tracing.json

# Persistent-thread eval
npm run local -- eval \
  -c examples/openai-codex-sdk/thread-persistence/promptfooconfig.yaml \
  --no-cache \
  -o /tmp/promptfoo-codex-thread.json

# Read-only sandbox eval
CODEX_SANDBOX_WORKING_DIR="$PWD/examples/openai-codex-sdk/sandbox/sample-workspace" \
npm run local -- eval \
  -c examples/openai-codex-sdk/sandbox/promptfooconfig.yaml \
  --no-cache \
  -o /tmp/promptfoo-codex-sandbox.json
```

Expected outcomes:

- The skill evals should return `CERULEAN-FALCON-SKILL` and include `response.metadata.skillCalls`.
- The thread-persistence eval should return `STORED` on the first row, `BLUE-OTTER-19` on the second row, and reuse one `sessionId`.
- The sandbox eval should report that `hello.txt` could not be created, and `examples/openai-codex-sdk/sandbox/sample-workspace/hello.txt` should not exist after the run.

For API-key-backed skill runs that avoid personal Codex config, set `CODEX_HOME_OVERRIDE="$PWD/examples/openai-codex-sdk/skills/sample-codex-home"` and provide `OPENAI_API_KEY` or `CODEX_API_KEY`.

## See Also

- [OpenAI Platform Documentation](https://platform.openai.com/docs/)
- [Standard OpenAI provider](/docs/providers/openai/) - For text-only interactions
- [Claude Agent SDK provider](/docs/providers/claude-agent-sdk/) - Alternative agentic provider
