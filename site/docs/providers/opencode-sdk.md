---
sidebar_position: 42
title: OpenCode SDK
description: 'Use OpenCode SDK for evals with 75+ providers, built-in tools, and terminal-native AI agent'
---

# OpenCode SDK

This provider integrates [OpenCode](https://opencode.ai/), an open-source AI coding agent for the terminal with support for 75+ LLM providers.

## Provider IDs

- `opencode:sdk` (full name)
- `opencode` (alias)

## Installation

The OpenCode SDK provider requires both the OpenCode CLI and the SDK package.

### 1. Install OpenCode CLI

```bash
curl -fsSL https://opencode.ai/install | bash
```

Or via other package managers - see [opencode.ai](https://opencode.ai) for options.

### 2. Install SDK Package

```bash
npm install @opencode-ai/sdk
```

:::note

The SDK package is an optional dependency and only needs to be installed if you want to use the OpenCode SDK provider.

:::

## Setup

Configure your LLM provider credentials. For Anthropic:

```bash
export ANTHROPIC_API_KEY=your_api_key_here
```

For OpenAI:

```bash
export OPENAI_API_KEY=your_api_key_here
```

OpenCode supports 75+ providers - see [Supported Providers](#supported-providers) for the full list.

## Quick Start

### Basic Usage

By default, OpenCode SDK runs in a temporary directory with no tools enabled:

```yaml title="promptfooconfig.yaml"
providers:
  - opencode:sdk

prompts:
  - 'Write a Python function that validates email addresses'
```

When your test cases finish, the temporary directory is deleted.

### With Working Directory

Specify a working directory to enable read-only file tools:

```yaml
providers:
  - id: opencode:sdk
    config:
      working_dir: ./src

prompts:
  - 'Review the TypeScript files and identify potential bugs'
```

By default, when you specify a working directory, OpenCode SDK has access to these read-only tools: `read`, `grep`, `glob`, `list`.

### With Full Tool Access

Enable additional tools for file modifications and shell access:

```yaml
providers:
  - id: opencode:sdk
    config:
      working_dir: ./project
      tools:
        read: true
        grep: true
        glob: true
        list: true
        write: true
        edit: true
        bash: true
      permission:
        bash: allow
        edit: allow
```

:::warning

When enabling write/edit/bash tools, consider how you will reset files after each test. See [Managing Side Effects](#managing-side-effects).

:::

## Supported Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `apiKey` | string | API key for the LLM provider | Environment variable |
| `baseUrl` | string | URL for existing OpenCode server | Auto-start server |
| `hostname` | string | Server hostname when starting new server | `127.0.0.1` |
| `port` | number | Server port when starting new server | `4096` |
| `timeout` | number | Server startup timeout (ms) | `30000` |
| `working_dir` | string | Directory for file operations | Temporary directory |
| `provider_id` | string | LLM provider (anthropic, openai, google, etc.) | Auto-detect |
| `model` | string | Model to use | Provider default |
| `tools` | object | Tool configuration | Read-only with working_dir |
| `permission` | object | Permission configuration for tools | Default permissions |
| `agent` | string | Built-in agent to use (build, plan) | Default agent |
| `custom_agent` | object | Custom agent configuration | None |
| `session_id` | string | Resume existing session | Create new session |
| `persist_sessions` | boolean | Keep sessions between calls | `false` |
| `mcp` | object | MCP server configuration | None |
| `max_retries` | number | Maximum retries for API calls | `2` |
| `log_level` | string | SDK log level | `warn` |
| `enable_streaming` | boolean | Enable streaming responses | `false` |

## Supported Providers

OpenCode supports 75+ LLM providers through [Models.dev](https://models.dev/):

**Cloud Providers:**

- Anthropic (Claude)
- OpenAI
- Google AI Studio / Vertex AI
- Amazon Bedrock
- Azure OpenAI
- Groq
- Together AI
- Fireworks AI
- DeepSeek
- Perplexity
- Cohere
- Mistral
- And many more...

**Local Models:**

- Ollama
- LM Studio
- llama.cpp

Configure the provider:

```yaml
providers:
  - id: opencode:sdk
    config:
      provider_id: anthropic
      model: claude-sonnet-4-20250514
```

## Tools and Permissions

### Default Tools

With no `working_dir` specified, OpenCode runs in a temp directory with no tools.

With `working_dir` specified, these read-only tools are enabled by default:

| Tool | Purpose |
|------|---------|
| `read` | Read file contents |
| `grep` | Search file contents with regex |
| `glob` | Find files by pattern |
| `list` | List directory contents |

### Tool Configuration

Customize available tools:

```yaml
# Enable additional tools
providers:
  - id: opencode:sdk
    config:
      working_dir: ./project
      tools:
        read: true
        grep: true
        glob: true
        list: true
        write: true # Enable file writing
        edit: true # Enable file editing
        bash: true # Enable shell commands
        patch: true # Enable patch application
        webfetch: true # Enable web fetching

# Disable specific tools
providers:
  - id: opencode:sdk
    config:
      working_dir: ./project
      tools:
        bash: false # Disable shell
```

### Permissions

Configure tool permissions:

```yaml
providers:
  - id: opencode:sdk
    config:
      permission:
        bash: allow # or 'ask' or 'deny'
        edit: allow
        webfetch: deny
```

## Session Management

### Ephemeral Sessions (Default)

Creates a new session for each eval:

```yaml
providers:
  - opencode:sdk
```

### Persistent Sessions

Reuse sessions between calls:

```yaml
providers:
  - id: opencode:sdk
    config:
      persist_sessions: true
```

### Session Resumption

Resume a specific session:

```yaml
providers:
  - id: opencode:sdk
    config:
      session_id: previous-session-id
```

## Custom Agents

Define custom agents with specific configurations:

```yaml
providers:
  - id: opencode:sdk
    config:
      custom_agent:
        description: Security-focused code reviewer
        model: claude-sonnet-4-20250514
        temperature: 0.3
        tools:
          read: true
          grep: true
          write: false
          bash: false
        prompt: |
          You are a security-focused code reviewer.
          Analyze code for vulnerabilities and report findings.
```

## MCP Integration

OpenCode supports MCP (Model Context Protocol) servers:

```yaml
providers:
  - id: opencode:sdk
    config:
      mcp:
        weather-server:
          type: local
          command: node
          args: ['mcp-weather-server.js']
        api-server:
          type: remote
          url: https://api.example.com/mcp
          headers:
            Authorization: 'Bearer token'
```

## Caching Behavior

This provider automatically caches responses based on:

- Prompt content
- Working directory fingerprint (if specified)
- Provider and model configuration
- Tool configuration

To disable caching:

```bash
export PROMPTFOO_CACHE_ENABLED=false
```

To bust the cache for a specific test:

```yaml
tests:
  - vars: {}
    options:
      bustCache: true
```

## Managing Side Effects

When using tools that allow side effects (write, edit, bash), consider:

- **Serial execution**: Set `evaluateOptions.maxConcurrency: 1` to prevent race conditions
- **Git reset**: Use git to reset files after each test
- **Extension hooks**: Use promptfoo hooks for setup/cleanup
- **Containers**: Run tests in containers for isolation

Example with serial execution:

```yaml
providers:
  - id: opencode:sdk
    config:
      working_dir: ./project
      tools:
        write: true
        edit: true

evaluateOptions:
  maxConcurrency: 1
```

## Comparison with Other Agentic Providers

| Feature | OpenCode SDK | Claude Agent SDK | Codex SDK |
|---------|--------------|------------------|-----------|
| Provider flexibility | 75+ providers | Anthropic only | OpenAI only |
| Architecture | Client-server | Direct API | Thread-based |
| Local models | Ollama, LM Studio | No | No |
| Tool ecosystem | Native + MCP | Native + MCP | Native |
| Working dir isolation | Yes | Yes | Git required |

Choose based on your use case:

- **Multiple providers / local models** → OpenCode SDK
- **Anthropic-specific features** → Claude Agent SDK
- **OpenAI-specific features** → Codex SDK

## Examples

See the [examples directory](https://github.com/promptfoo/promptfoo/tree/main/examples/opencode-sdk) for complete implementations:

- [Basic usage](https://github.com/promptfoo/promptfoo/tree/main/examples/opencode-sdk/basic) - Simple chat-only mode

## See Also

- [OpenCode Documentation](https://opencode.ai/docs/)
- [OpenCode SDK Reference](https://opencode.ai/docs/sdk/)
- [Claude Agent SDK Provider](/docs/providers/claude-agent-sdk/) - Alternative agentic provider
- [OpenAI Codex SDK Provider](/docs/providers/openai-codex-sdk/) - Alternative agentic provider
