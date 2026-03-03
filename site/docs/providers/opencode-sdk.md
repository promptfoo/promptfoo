---
sidebar_position: 42
title: OpenCode SDK
description: 'Use OpenCode SDK for evals with 75+ providers, built-in tools, and terminal-native AI agent'
---

# OpenCode SDK

This provider integrates [OpenCode](https://opencode.ai/), an open-source AI coding agent for the terminal with support for 75+ LLM providers.

## Provider IDs

- `opencode:sdk` - Uses OpenCode's configured model
- `opencode` - Same as `opencode:sdk`

The model is configured via the OpenCode CLI or `~/.opencode/config.yaml`.

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

Use `opencode:sdk` to access OpenCode's configured model:

```yaml title="promptfooconfig.yaml"
providers:
  - opencode:sdk

prompts:
  - 'Write a Python function that validates email addresses'
```

Configure your model via the OpenCode CLI: `opencode config set model openai/gpt-4o`

By default, OpenCode SDK runs in a temporary directory with no tools enabled. When your test cases finish, the temporary directory is deleted.

### With Inline Model Configuration

Specify the provider and model directly in your config:

```yaml title="promptfooconfig.yaml"
providers:
  - id: opencode:sdk
    config:
      provider_id: anthropic
      model: claude-sonnet-4-20250514

prompts:
  - 'Write a Python function that validates email addresses'
```

This overrides the model configured via the OpenCode CLI for this specific eval.

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

| Parameter          | Type    | Description                                    | Default                    |
| ------------------ | ------- | ---------------------------------------------- | -------------------------- |
| `apiKey`           | string  | API key for the LLM provider                   | Environment variable       |
| `baseUrl`          | string  | URL for existing OpenCode server               | Auto-start server          |
| `hostname`         | string  | Server hostname when starting new server       | `127.0.0.1`                |
| `port`             | number  | Server port when starting new server           | Auto-select                |
| `timeout`          | number  | Server startup timeout (ms)                    | `30000`                    |
| `working_dir`      | string  | Directory for file operations                  | Temporary directory        |
| `provider_id`      | string  | LLM provider (anthropic, openai, google, etc.) | Auto-detect                |
| `model`            | string  | Model to use                                   | Provider default           |
| `tools`            | object  | Tool configuration                             | Read-only with working_dir |
| `permission`       | object  | Permission configuration for tools             | Ask for dangerous tools    |
| `agent`            | string  | Built-in agent to use (build, plan)            | Default agent              |
| `custom_agent`     | object  | Custom agent configuration                     | None                       |
| `session_id`       | string  | Resume existing session                        | Create new session         |
| `persist_sessions` | boolean | Keep sessions between calls                    | `false`                    |
| `mcp`              | object  | MCP server configuration                       | None                       |
| `cache_mcp`        | boolean | Enable caching when MCP is configured          | `false`                    |

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

Configure your preferred model using the OpenCode CLI:

```bash
# Set your default model
opencode config set model anthropic/claude-sonnet-4-20250514

# Or for OpenAI
opencode config set model openai/gpt-4o

# Or for local models
opencode config set model ollama/llama3
```

## Tools and Permissions

### Default Tools

With no `working_dir` specified, OpenCode runs in a temp directory with no tools.

With `working_dir` specified, these read-only tools are enabled by default:

| Tool   | Purpose                         |
| ------ | ------------------------------- |
| `read` | Read file contents              |
| `grep` | Search file contents with regex |
| `glob` | Find files by pattern           |
| `list` | List directory contents         |

### All Available Tools

| Tool        | Purpose                                  | Default |
| ----------- | ---------------------------------------- | ------- |
| `bash`      | Execute shell commands                   | false   |
| `edit`      | Modify existing files                    | false   |
| `write`     | Create/overwrite files                   | false   |
| `read`      | Read file contents                       | true\*  |
| `grep`      | Search file contents with regex          | true\*  |
| `glob`      | Find files by pattern                    | true\*  |
| `list`      | List directory contents                  | true\*  |
| `patch`     | Apply diff patches                       | false   |
| `todowrite` | Create task lists                        | false   |
| `todoread`  | Read task lists                          | false   |
| `webfetch`  | Fetch web content                        | false   |
| `question`  | Prompt user for input during execution   | false   |
| `skill`     | Load SKILL.md files into conversation    | false   |
| `lsp`       | Code intelligence queries (experimental) | false   |

\* Only enabled when `working_dir` is specified.

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
        question: true # Enable user prompts
        skill: true # Enable SKILL.md loading

# Disable specific tools
providers:
  - id: opencode:sdk
    config:
      working_dir: ./project
      tools:
        bash: false # Disable shell
```

### Permissions

Configure tool permissions using simple values or pattern-based rules:

```yaml
# Simple permissions
providers:
  - id: opencode:sdk
    config:
      permission:
        bash: allow # or 'ask' or 'deny'
        edit: allow
        webfetch: deny
        doom_loop: deny # Prevent infinite agent loops
        external_directory: deny # Block access outside working dir

# Pattern-based permissions
providers:
  - id: opencode:sdk
    config:
      permission:
        bash:
          'git *': allow # Allow git commands
          'rm *': deny # Deny rm commands
          '*': ask # Ask for everything else
        edit:
          '*.md': allow # Allow editing markdown
          'src/**': ask # Ask for src directory
```

| Permission           | Purpose                          |
| -------------------- | -------------------------------- |
| `bash`               | Shell command execution          |
| `edit`               | File editing                     |
| `webfetch`           | Web fetching                     |
| `doom_loop`          | Prevents infinite agent loops    |
| `external_directory` | Access outside working directory |

:::tip Security Recommendation

For security-conscious deployments, set `doom_loop: deny` and `external_directory: deny` to prevent infinite agent loops and restrict file access to the working directory.

:::

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
        mode: primary # 'primary', 'subagent', or 'all'
        model: claude-sonnet-4-20250514
        temperature: 0.3
        top_p: 0.9 # Nucleus sampling parameter
        steps: 10 # Max iterations before text-only response
        color: '#ff5500' # Visual identification
        tools:
          read: true
          grep: true
          write: false
          bash: false
        permission:
          edit: deny
          external_directory: deny
        prompt: |
          You are a security-focused code reviewer.
          Analyze code for vulnerabilities and report findings.
```

| Parameter     | Type    | Description                               |
| ------------- | ------- | ----------------------------------------- |
| `description` | string  | Required. Explains the agent's purpose    |
| `mode`        | string  | 'primary', 'subagent', or 'all'           |
| `model`       | string  | Model ID (overrides global)               |
| `temperature` | number  | Response randomness (0.0-1.0)             |
| `top_p`       | number  | Nucleus sampling (0.0-1.0)                |
| `steps`       | number  | Max iterations before text-only response  |
| `color`       | string  | Hex color for visual identification       |
| `tools`       | object  | Tool configuration                        |
| `permission`  | object  | Permission configuration                  |
| `prompt`      | string  | Custom system prompt                      |
| `disable`     | boolean | Disable this agent                        |
| `hidden`      | boolean | Hide from @ autocomplete (subagents only) |

## MCP Integration

OpenCode supports MCP (Model Context Protocol) servers:

```yaml
providers:
  - id: opencode:sdk
    config:
      mcp:
        # Local MCP server
        weather-server:
          type: local
          command: ['node', 'mcp-weather-server.js']
          environment:
            API_KEY: '{{env.WEATHER_API_KEY}}'
          timeout: 30000
          enabled: true

        # Remote MCP server with headers
        api-server:
          type: remote
          url: https://api.example.com/mcp
          headers:
            Authorization: 'Bearer {{env.API_TOKEN}}'

        # Remote MCP server with OAuth
        oauth-server:
          type: remote
          url: https://secure.example.com/mcp
          oauth:
            clientId: '{{env.OAUTH_CLIENT_ID}}'
            clientSecret: '{{env.OAUTH_CLIENT_SECRET}}'
            scope: 'read write'
```

## Caching Behavior

This provider automatically caches responses based on:

- Prompt content
- Working directory fingerprint (if specified)
- Provider and model configuration
- Tool configuration

When MCP servers are configured, caching is disabled by default because MCP tools typically interact with external state. To opt back into caching for deterministic MCP tools, set `cache_mcp: true`:

```yaml
providers:
  - id: opencode:sdk
    config:
      cache_mcp: true
      mcp:
        my-server:
          type: local
          command: ['node', 'my-deterministic-mcp-server.js']
```

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

| Feature               | OpenCode SDK      | Claude Agent SDK | Codex SDK    |
| --------------------- | ----------------- | ---------------- | ------------ |
| Provider flexibility  | 75+ providers     | Anthropic only   | OpenAI only  |
| Architecture          | Client-server     | Direct API       | Thread-based |
| Local models          | Ollama, LM Studio | No               | No           |
| Tool ecosystem        | Native + MCP      | Native + MCP     | Native       |
| Working dir isolation | Yes               | Yes              | Git required |

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
