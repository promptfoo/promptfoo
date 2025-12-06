---
sidebar_position: 42
title: OpenHands SDK
description: 'Use OpenHands for evals with 100+ LLM providers via LiteLLM and Docker-based sandboxed execution'
---

# OpenHands SDK

This provider integrates [OpenHands](https://github.com/All-Hands-AI/OpenHands), an open-source AI coding agent with 72.8% SWE-Bench Verified performance.

## Provider IDs

- `openhands:sdk` - Uses OpenHands with configured model
- `openhands` - Same as `openhands:sdk`

## Installation

The OpenHands SDK provider requires Docker and Python 3.12+.

### 1. Install OpenHands Agent Server

```bash
pip install openhands-ai
```

### 2. Set up Docker

OpenHands uses Docker for sandboxed execution. Ensure Docker is installed and running:

```bash
docker --version
```

## Setup

Configure your LLM provider credentials. For Anthropic:

```bash
export ANTHROPIC_API_KEY=your_api_key_here
```

For OpenAI:

```bash
export OPENAI_API_KEY=your_api_key_here
```

OpenHands supports 100+ providers through [LiteLLM](https://litellm.ai/).

## Quick Start

### Basic Usage

```yaml title="promptfooconfig.yaml"
providers:
  - id: openhands:sdk
    config:
      provider_id: anthropic
      model: claude-sonnet-4-20250514

prompts:
  - 'Write a Python function that validates email addresses'
```

By default, OpenHands SDK runs in a temporary directory. When your test cases finish, the temporary directory is deleted.

### With Working Directory

Specify a working directory to enable file operations:

```yaml
providers:
  - id: openhands:sdk
    config:
      provider_id: anthropic
      model: claude-sonnet-4-20250514
      working_dir: ./src

prompts:
  - 'Review the TypeScript files and identify potential bugs'
```

### With Docker Sandbox

Enable full sandboxed execution with Docker:

```yaml
providers:
  - id: openhands:sdk
    config:
      provider_id: openai
      model: gpt-4o
      working_dir: ./project
      workspace_type: docker
```

## Supported Parameters

| Parameter          | Type    | Description                                   | Default             |
| ------------------ | ------- | --------------------------------------------- | ------------------- |
| `apiKey`           | string  | API key for the LLM provider                  | Environment variable |
| `provider_id`      | string  | LLM provider (anthropic, openai, google, etc.) | Auto-detect         |
| `model`            | string  | Model to use                                  | Provider default    |
| `baseUrl`          | string  | URL for existing OpenHands server             | Auto-start server   |
| `hostname`         | string  | Server hostname when starting new server      | `127.0.0.1`         |
| `port`             | number  | Server port when starting new server          | `3000`              |
| `timeout`          | number  | Server startup timeout (ms)                   | `60000`             |
| `working_dir`      | string  | Directory for file operations                 | Temporary directory |
| `workspace_type`   | string  | Execution environment (local, docker, remote) | `local`             |
| `max_iterations`   | number  | Maximum agent iterations                      | `50`                |
| `session_id`       | string  | Resume existing session                       | Create new session  |
| `persist_sessions` | boolean | Keep sessions between calls                   | `false`             |
| `tools`            | object  | Tool configuration                            | All enabled         |

## Supported Providers

OpenHands supports 100+ LLM providers through LiteLLM:

**Cloud Providers:**

- Anthropic (Claude)
- OpenAI
- Google AI Studio / Vertex AI
- Amazon Bedrock
- Azure OpenAI
- Groq
- Together AI
- DeepSeek
- Mistral
- And many more...

**Local Models:**

- Ollama
- LM Studio
- llama.cpp

## Session Management

### Ephemeral Sessions (Default)

Creates a new conversation for each eval:

```yaml
providers:
  - openhands:sdk
```

### Persistent Sessions

Reuse sessions between calls:

```yaml
providers:
  - id: openhands:sdk
    config:
      persist_sessions: true
```

### Session Resumption

Resume a specific session:

```yaml
providers:
  - id: openhands:sdk
    config:
      session_id: previous-session-id
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

## Comparison with Other Agentic Providers

| Feature               | OpenHands SDK     | OpenCode SDK      | Claude Agent SDK | Codex SDK    |
| --------------------- | ----------------- | ----------------- | ---------------- | ------------ |
| SWE-Bench performance | 72.8%             | N/A               | N/A              | N/A          |
| Provider flexibility  | 100+ (LiteLLM)    | 75+ (Models.dev)  | Anthropic only   | OpenAI only  |
| Architecture          | Client-server     | Client-server     | Direct API       | Thread-based |
| Sandbox execution     | Docker            | No                | No               | No           |
| Local models          | Ollama, LM Studio | Ollama, LM Studio | No               | No           |

Choose based on your use case:

- **Sandboxed execution** → OpenHands SDK
- **SWE-Bench style tasks** → OpenHands SDK
- **Multiple providers / local models** → OpenHands SDK or OpenCode SDK
- **Anthropic-specific features** → Claude Agent SDK
- **OpenAI-specific features** → Codex SDK

## See Also

### Other coding agent providers

- [OpenCode SDK](/docs/providers/opencode-sdk/) - Terminal-native AI agent with 75+ providers
- [Claude Agent SDK](/docs/providers/claude-agent-sdk/) - Anthropic's agentic framework
- [OpenAI Codex SDK](/docs/providers/openai-codex-sdk/) - OpenAI's thread-based agent

### Guides

- [Evaluate Coding Agents](/docs/guides/evaluate-coding-agents) - Comparison guide and best practices

### External resources

- [OpenHands Documentation](https://docs.all-hands.dev/)
- [OpenHands GitHub](https://github.com/All-Hands-AI/OpenHands)
