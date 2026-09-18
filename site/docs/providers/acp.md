---
sidebar_label: ACP (Agent Client Protocol)
sidebar_position: 5
title: ACP (Agent Client Protocol)
description: 'Evaluate any ACP-compatible coding agent with configurable permissions, tool tracking, and OTEL tracing'
---

# ACP (Agent Client Protocol)

This provider evaluates any [ACP-compatible](https://agentclientprotocol.com/) coding agent through promptfoo. ACP is an open standard for communication between code editors and AI-powered coding agents, similar to what LSP did for language servers.

## Provider IDs

Reference this provider using:

- `acp`

The agent binary is specified via `config.command`, not in the provider ID.

## Installation

The ACP provider requires the `@agentclientprotocol/sdk` package:

```bash
npm install @agentclientprotocol/sdk
```

You also need an ACP-compatible agent binary installed on your system. See the [ACP Agent Registry](https://agentclientprotocol.com/get-started/registry) for available agents.

:::note
`@agentclientprotocol/sdk` is an optional dependency that installs automatically with `npm install`. If you installed promptfoo without optional dependencies, install it separately: `npm install @agentclientprotocol/sdk`
:::

## Setup

No API keys or authentication are needed for the ACP provider itself. Authentication is handled by the agent binary. Ensure your chosen agent is installed and authenticated:

```bash
# Kiro (built-in ACP mode)
kiro-cli acp --help

# Claude Code (via community bridge)
npx claude-code-acp --help

# Codex
codex-acp --help
```

## Quick Start

### Basic Usage

```yaml
providers:
  - id: acp
    config:
      command: ['kiro-cli', 'acp']

prompts:
  - 'Write a Python function that calculates factorial'

tests:
  - assert:
      - type: contains
        value: 'factorial'
```

### With Working Directory

```yaml
providers:
  - id: acp
    config:
      command: ['kiro-cli', 'acp']
      working_dir: ./src
      timeout: 180

prompts:
  - 'Review the TypeScript files and identify potential bugs'
```

### Comparing Agents

Evaluate the same prompt across different ACP agents:

```yaml
providers:
  - id: acp
    label: kiro
    config:
      command: ['kiro-cli', 'acp']
  - id: acp
    label: claude-code
    config:
      command: ['npx', 'claude-code-acp']
  - id: acp
    label: codex
    config:
      command: codex-acp

prompts:
  - 'Refactor the authentication module to use async/await'
```

## Supported Parameters

| Parameter             | Type                         | Description                              | Default           |
| --------------------- | ---------------------------- | ---------------------------------------- | ----------------- |
| `command`             | string \| string[]           | Agent binary to spawn (**required**)     | -                 |
| `working_dir`         | string                       | Working directory for the agent          | Current directory |
| `timeout`             | number                       | Per-session timeout in seconds           | `300`             |
| `model`               | string                       | Model to use (passed via ACP config)     | Agent default     |
| `permission_mode`     | `'auto_approve'` \| `'deny'` | How to handle permission requests        | `'deny'`          |
| `env`                 | object                       | Custom environment variables             | Minimal shell env |
| `inherit_process_env` | boolean                      | Forward full process environment         | `false`           |
| `deep_tracing`        | boolean                      | Propagate OTEL TRACEPARENT to subprocess | `false`           |

## Models

Pass a model to the agent via ACP's config option mechanism:

```yaml
providers:
  - id: acp
    config:
      command: ['kiro-cli', 'acp']
      model: claude-sonnet-4-5
```

Model support depends on the agent. Not all agents expose a `model` config option via ACP.

## Permission Handling

By default, the provider denies all permission requests (tools, file writes, shell commands). Set `permission_mode: auto_approve` to allow agents to use tools freely during evaluations.

```yaml
providers:
  - id: acp
    config:
      command: ['kiro-cli', 'acp']
      permission_mode: deny # Deny all permission requests
```

| Mode          | Behavior                                                 |
| ------------- | -------------------------------------------------------- |
| `auto_approve | Select the first `allow_once` or `allow_always` option   |
| `deny`        | Return `cancelled` for all permission requests (default) |

## Tool Call Tracking

The provider captures all tool calls made by the agent during the session. Use them in assertions:

```yaml
tests:
  - assert:
      - type: javascript
        value: |
          const toolCalls = context.providerResponse?.metadata?.toolCalls || [];
          return toolCalls.some(t => t.name === 'Read');
```

Each tool call entry contains:

| Field      | Type    | Description                              |
| ---------- | ------- | ---------------------------------------- |
| `id`       | string  | Unique tool call ID                      |
| `name`     | string  | Tool name (e.g., `Read`, `Bash`, `Grep`) |
| `input`    | unknown | Arguments passed to the tool             |
| `output`   | unknown | Tool result                              |
| `is_error` | boolean | Whether the tool call errored            |

## Caching

Responses are cached based on the prompt, provider configuration, and a working directory fingerprint (file modification times). Changing source files automatically invalidates the cache.

Disable caching for a run:

```bash
npx promptfoo eval --no-cache
```

Or globally:

```bash
export PROMPTFOO_CACHE_ENABLED=false
```

## Agent Compatibility

See the [ACP Agent Registry](https://agentclientprotocol.com/get-started/registry) for a full list of compatible agents.

| Agent       | `config.command`             | Notes                                          |
| ----------- | ---------------------------- | ---------------------------------------------- |
| Kiro        | `["kiro-cli", "acp"]`        | Built-in ACP support                           |
| Claude Code | `["npx", "claude-code-acp"]` | Community bridge (does not speak ACP natively) |
| Codex       | `codex-acp`                  | Official ACP adapter                           |
| Cursor      | `cursor-agent-acp`           | Community ACP adapter                          |

## Comparison with Other Agentic Providers

| Feature   | ACP                 | Claude Agent SDK     | Codex SDK       |
| --------- | ------------------- | -------------------- | --------------- |
| Protocol  | ACP (open standard) | Proprietary SDK      | Proprietary SDK |
| Agents    | Any ACP agent       | Claude only          | Codex only      |
| MCP tools | Via agent config    | Native `mcp_servers` | N/A             |
| Sandbox   | Via agent           | Built-in             | Built-in        |

**Choose ACP when:**

- You want to evaluate multiple agents with the same config
- You're using an agent not covered by a dedicated provider
- You want provider-agnostic agent evals

**Choose a dedicated provider when:**

- You need deep integration with a specific agent's features (sandbox, MCP, sessions)
- You need native multi-turn session persistence

## Examples

See the [examples directory](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-acp) for complete configurations:

- [Basic usage](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-acp/basic) - Single-turn eval
- [Skills testing](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-acp/skills) - Verify skill discovery via tool calls

## See Also

- [Agent Client Protocol specification](https://agentclientprotocol.com/)
- [ACP Agent Registry](https://agentclientprotocol.com/get-started/registry)
- [TypeScript ACP SDK](https://github.com/agentclientprotocol/typescript-sdk)
- [Claude Agent SDK provider](/docs/providers/claude-agent-sdk/) - Dedicated Claude provider
- [OpenAI Codex SDK provider](/docs/providers/openai-codex-sdk/) - Dedicated Codex provider
