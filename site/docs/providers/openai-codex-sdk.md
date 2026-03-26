---
sidebar_position: 41
title: OpenAI Codex SDK
description: 'Use OpenAI Codex SDK for evals with thread management, structured output, and Git-aware operations'
---

# OpenAI Codex SDK

This provider makes OpenAI's Codex SDK available for evals. The Codex SDK supports code generation and manipulation with thread-based conversations and JSON schema output.

:::note

The OpenAI Codex SDK is a proprietary package and is not installed by default. You must install it separately.

:::

## Provider IDs

You can reference this provider using either base ID, and you can inline the model in the provider path:

- `openai:codex-sdk` or `openai:codex-sdk:<model name>` (full name)
- `openai:codex` or `openai:codex:<model name>` (alias)

## Installation

The OpenAI Codex SDK provider requires the `@openai/codex-sdk` package to be installed separately:

```bash
npm install @openai/codex-sdk
```

:::note

This is an optional dependency and only needs to be installed if you want to use the OpenAI Codex SDK provider. Note that the codex-sdk library may have a proprietary license.

:::

## Setup

The Codex SDK can authenticate with either an existing Codex/ChatGPT login or an API key.

### Option 1: Use your ChatGPT login

Sign in through the Codex CLI first:

```bash
codex
```

Then follow the sign-in flow with ChatGPT. When `apiKey`, `OPENAI_API_KEY`, and `CODEX_API_KEY` are all unset, promptfoo's `openai:codex-sdk` provider lets the Codex SDK reuse that existing login state.

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

By default, the Codex SDK runs in the current working directory and requires a Git repository for safety. This prevents errors from code modifications.

```yaml title="promptfooconfig.yaml"
providers:
  - openai:codex-sdk

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

Specify a custom working directory for the Codex SDK to operate in:

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

| Parameter                | Type     | Description                                               | Default                |
| ------------------------ | -------- | --------------------------------------------------------- | ---------------------- |
| `apiKey`                 | string   | OpenAI API key. Optional when Codex is already signed in. | Environment variable   |
| `base_url`               | string   | Custom base URL for API requests (for proxies)            | None                   |
| `working_dir`            | string   | Directory for Codex to operate in                         | Current directory      |
| `additional_directories` | string[] | Additional directories the agent can access               | None                   |
| `model`                  | string   | Model to use                                              | SDK default            |
| `sandbox_mode`           | string   | Sandbox access level (see below)                          | `workspace-write`      |
| `model_reasoning_effort` | string   | Reasoning intensity (see below)                           | SDK default            |
| `network_access_enabled` | boolean  | Allow network requests                                    | false                  |
| `web_search_enabled`     | boolean  | Allow web search                                          | false                  |
| `approval_policy`        | string   | When to require approval (see below)                      | SDK default            |
| `cli_config`             | object   | Additional Codex CLI config overrides                     | None                   |
| `skip_git_repo_check`    | boolean  | Skip Git repository validation                            | false                  |
| `codex_path_override`    | string   | Custom path to codex binary                               | None                   |
| `thread_id`              | string   | Resume existing thread from ~/.codex/sessions             | None (creates new)     |
| `persist_threads`        | boolean  | Keep threads alive between calls                          | false                  |
| `thread_pool_size`       | number   | Max concurrent threads (when persist_threads)             | 1                      |
| `output_schema`          | object   | JSON schema for structured responses                      | None                   |
| `cli_env`                | object   | Custom environment variables for Codex CLI                | Inherits from process  |
| `inherit_process_env`    | boolean  | Merge process env when `cli_env` is set                   | `false` with `cli_env` |
| `enable_streaming`       | boolean  | Enable streaming events                                   | false                  |
| `deep_tracing`           | boolean  | Enable OpenTelemetry tracing of CLI internals             | false                  |

### Sandbox Modes

The `sandbox_mode` parameter controls filesystem access:

- `read-only` - Agent can only read files (safest)
- `workspace-write` - Agent can write to working directory (default)
- `danger-full-access` - Agent has full filesystem access (use with caution)

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
- **GPT-5.3 Codex** - Latest codex generation (`gpt-5.3-codex`, `gpt-5.3-codex-spark`)
- **GPT-5.2** - Current GPT-5.2 line (`gpt-5.2`, `gpt-5.2-codex`)
- **GPT-5.1 Codex** - Optimized for code generation (`gpt-5.1-codex`, `gpt-5.1-codex-max`, `gpt-5.1-codex-mini`)
- **GPT-5 Codex** - Previous generation (`gpt-5-codex`, `gpt-5-codex-mini`)
- **GPT-5** - Base GPT-5 model (`gpt-5`)

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

Reuse threads between evals with the same configuration:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      persist_threads: true
      thread_pool_size: 2 # Allow up to 2 concurrent threads
```

Threads are pooled by cache key (working dir + model + output schema + prompt). When the pool is full, the oldest thread is evicted.

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
        value: 'output.function_name.includes("fibonacci")'
```

The output will be valid JSON matching your schema.

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

When streaming is enabled, the provider processes events like `item.completed` and `turn.completed` to build the final response.

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

For future CLI-level tracing support, enable `deep_tracing`:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      deep_tracing: true
      enable_streaming: true
```

Deep tracing injects OpenTelemetry environment variables (`OTEL_EXPORTER_OTLP_ENDPOINT`, `TRACEPARENT`, etc.) into the Codex CLI process, enabling trace context propagation when the CLI adds native OTEL support.

:::warning

Deep tracing is **incompatible with thread persistence**. When `deep_tracing: true`:

- `persist_threads`, `thread_id`, and `thread_pool_size` are ignored
- A fresh Codex instance is created for each call to ensure correct span linking

:::

### Viewing Traces

Run your eval and view traces in your OTLP-compatible backend (Jaeger, Zipkin, etc.):

```bash
promptfoo eval -c promptfooconfig.yaml
```

## Git Repository Requirement

By default, the Codex SDK requires a Git repository in the working directory. This prevents errors from code modifications.

The provider validates:

1. Working directory exists and is accessible
2. Working directory is a directory (not a file)
3. `.git` directory exists in the working directory

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

## Web Search and Network Access

Enable the agent to search the web or make network requests:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      web_search_enabled: true # Allow web searches
      network_access_enabled: true # Allow network requests
```

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

Collaboration mode is a beta feature. Some user-configured settings like `model` and `model_reasoning_effort` may be overridden by collaboration presets.

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

| Level     | Description                          | Supported Models                    |
| --------- | ------------------------------------ | ----------------------------------- |
| `none`    | No reasoning overhead                | gpt-5.4, gpt-5.2                    |
| `minimal` | SDK alias for minimal reasoning      | All models                          |
| `low`     | Light reasoning, faster responses    | All models                          |
| `medium`  | Balanced (default)                   | All models                          |
| `high`    | Thorough reasoning for complex tasks | All models                          |
| `xhigh`   | Maximum reasoning depth              | gpt-5.4, gpt-5.2, gpt-5.1-codex-max |

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

By default, the provider inherits all environment variables from the Node.js process.
If you set `cli_env`, promptfoo passes only those custom variables plus the provider's resolved API key by default. This keeps the Codex runtime isolated from unrelated process secrets.

To merge the process environment anyway, set `inherit_process_env: true`:

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

`metadata.skillCalls` is a heuristic. The Codex SDK currently does not expose a first-class skill invocation event, so promptfoo infers skill usage from commands that directly reference `.agents/skills/.../SKILL.md` files during the run.

:::

For reproducible CI runs, use `cli_env.CODEX_HOME` to point Codex at a project-local home directory. That isolates the eval from any personal Codex configuration or user-level skills on the machine.

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

- Prompt content
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
        value: 'Array.isArray(output.findings)'
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
- [Agentic SDK comparison](https://github.com/promptfoo/promptfoo/tree/main/examples/compare-agentic-sdks) - Side-by-side comparison with Claude Agent SDK

## See Also

- [OpenAI Platform Documentation](https://platform.openai.com/docs/)
- [Standard OpenAI provider](/docs/providers/openai/) - For text-only interactions
- [Claude Agent SDK provider](/docs/providers/claude-agent-sdk/) - Alternative agentic provider
