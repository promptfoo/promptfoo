---
title: OpenClaw
sidebar_label: OpenClaw
sidebar_position: 42
description: 'Use OpenClaw, a personal AI assistant framework, as an eval target with auto-detected gateway and auth'
---

# OpenClaw

OpenClaw is a personal AI assistant framework that enables agentic evaluations with configurable reasoning and session management.

## Prerequisites

1. Install OpenClaw:

```sh
npm install -g openclaw@latest
```

2. Run the onboarding wizard:

```sh
openclaw onboard
```

3. Enable the HTTP API by adding to `~/.openclaw/openclaw.json`:

```json
{
  "gateway": {
    "http": {
      "endpoints": {
        "chatCompletions": {
          "enabled": true
        }
      }
    }
  }
}
```

4. Start the gateway:

```sh
openclaw gateway
```

Or restart if already running:

```sh
openclaw gateway restart
```

## Provider Types

OpenClaw exposes four provider types, each targeting a different gateway API surface:

| Provider    | Format                    | API                    | Use Case                                            |
| ----------- | ------------------------- | ---------------------- | --------------------------------------------------- |
| Chat        | `openclaw:main`           | `/v1/chat/completions` | Standard chat completions (default)                 |
| Responses   | `openclaw:responses:main` | `/v1/responses`        | OpenResponses-compatible API with item-based inputs |
| Agent       | `openclaw:agent:main`     | WebSocket RPC          | Full agent streaming via native WS protocol         |
| Tool Invoke | `openclaw:tools:bash`     | `/tools/invoke`        | Direct tool invocation for red team testing         |

### Chat (default)

Uses the OpenAI-compatible chat completions endpoint. This is the default when no keyword is specified.

- `openclaw` - Uses the default agent
- `openclaw:main` - Explicitly targets the main agent
- `openclaw:<agent-id>` - Targets a specific agent by ID

### Responses

Uses the OpenResponses-compatible `/v1/responses` endpoint. Requires enabling in gateway config:

```json
{
  "gateway": {
    "http": {
      "endpoints": {
        "responses": { "enabled": true }
      }
    }
  }
}
```

- `openclaw:responses` - Default agent via Responses API
- `openclaw:responses:main` - Explicit agent ID
- `openclaw:responses:<agent-id>` - Custom agent

### WebSocket Agent

Uses the native OpenClaw WebSocket RPC protocol for full agent streaming. Connects directly to the gateway's WS port without requiring HTTP endpoint enablement.

- `openclaw:agent` - Default agent via WS
- `openclaw:agent:main` - Explicit agent ID
- `openclaw:agent:<agent-id>` - Custom agent

### Tool Invoke

Invokes a specific tool directly via `POST /tools/invoke`. Useful for red team testing individual tools in isolation. The prompt is parsed as JSON for tool arguments.

:::note
If the tool isn't allowlisted by OpenClaw policy, the gateway returns a 404 error. Make sure the tool is enabled in your OpenClaw configuration.
:::

- `openclaw:tools:bash` - Invoke the bash tool
- `openclaw:tools:agents_list` - Invoke the agents_list tool

## Configuration

### Auto-Detection

The provider automatically detects the gateway URL and auth token from `~/.openclaw/openclaw.json`:

```yaml title="promptfooconfig.yaml"
providers:
  - openclaw:main
```

### Explicit Configuration

Override auto-detection with explicit config:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openclaw:main
    config:
      gateway_url: http://127.0.0.1:18789
      auth_token: your-token-here
      session_key: custom-session
```

### Environment Variables

Set configuration via environment variables:

```sh
export OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
export OPENCLAW_GATEWAY_TOKEN=your-token-here
```

```yaml title="promptfooconfig.yaml"
providers:
  - openclaw:main
```

## Config Options

| Config Property | Environment Variable   | Description                                        |
| --------------- | ---------------------- | -------------------------------------------------- |
| gateway_url     | OPENCLAW_GATEWAY_URL   | Gateway URL (default: auto-detected)               |
| auth_token      | OPENCLAW_GATEWAY_TOKEN | Auth token (default: auto-detected)                |
| thinking_level  | -                      | Reasoning depth (WS Agent only): low, medium, high |
| session_key     | -                      | Session identifier for conversation continuity     |
| timeoutMs       | -                      | WebSocket agent timeout in milliseconds            |

## Examples

### Basic Usage

```yaml title="promptfooconfig.yaml"
prompts:
  - 'What is the capital of {{country}}?'

providers:
  - openclaw:main

tests:
  - vars:
      country: France
    assert:
      - type: contains
        value: Paris
```

### With Custom Thinking Level (WS Agent)

`thinking_level` is only supported by the WebSocket Agent provider:

```yaml title="promptfooconfig.yaml"
prompts:
  - 'Analyze the pros and cons of {{topic}}'

providers:
  - id: openclaw:agent:main
    config:
      thinking_level: high
      timeoutMs: 60000

tests:
  - vars:
      topic: renewable energy
```

### Using Responses API

```yaml title="promptfooconfig.yaml"
prompts:
  - 'Summarize: {{text}}'

providers:
  - openclaw:responses:main

tests:
  - vars:
      text: The quick brown fox jumps over the lazy dog.
```

### WebSocket Agent

```yaml title="promptfooconfig.yaml"
prompts:
  - '{{task}}'

providers:
  - id: openclaw:agent:main
    config:
      timeoutMs: 60000

tests:
  - vars:
      task: What files are in the current directory?
```

### Tool Invoke (Red Team)

```yaml title="promptfooconfig.yaml"
prompts:
  - '{"command": "{{cmd}}"}'

providers:
  - openclaw:tools:bash

tests:
  - vars:
      cmd: echo hello
    assert:
      - type: contains
        value: hello
```

## See Also

For a complete example, see [examples/openclaw](https://github.com/promptfoo/promptfoo/tree/main/examples/openclaw).
