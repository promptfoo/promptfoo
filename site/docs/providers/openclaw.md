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

3. Enable the HTTP API in `~/.openclaw/openclaw.json` if you want Chat or Responses.
   These HTTP endpoints are disabled by default upstream:

```json
{
  "gateway": {
    "http": {
      "endpoints": {
        "chatCompletions": {
          "enabled": true
        },
        "responses": {
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

OpenClaw exposes five provider types, each targeting a different gateway API surface:

| Provider    | Format                         | API                    | Use Case                                             |
| ----------- | ------------------------------ | ---------------------- | ---------------------------------------------------- |
| Chat        | `openclaw:main`                | `/v1/chat/completions` | Standard chat completions (default)                  |
| Responses   | `openclaw:responses:main`      | `/v1/responses`        | OpenResponses-compatible API with item-based inputs  |
| Embeddings  | `openclaw:embedding:main`      | `/v1/embeddings`       | OpenAI-compatible embeddings through an agent target |
| Agent       | `openclaw:agent:main`          | WebSocket RPC          | Full agent streaming via native WS protocol          |
| Tool Invoke | `openclaw:tools:sessions_list` | `/tools/invoke`        | Direct tool invocation for stable built-in tools     |

### Chat (default)

Uses the OpenAI-compatible chat completions endpoint. This is the default when no keyword is specified.
Requires `gateway.http.endpoints.chatCompletions.enabled=true`.

- `openclaw` - Uses the default agent
- `openclaw:main` - Explicitly targets the main agent
- `openclaw:<agent-id>` - Targets a specific agent by ID

Promptfoo sends OpenClaw's current slash-style model id (`openclaw/<agent-id>`) to the gateway
while keeping the `openclaw:<agent-id>` promptfoo provider syntax for compatibility.

### Responses

Uses the OpenResponses-compatible `/v1/responses` endpoint. This endpoint is also disabled by
default and requires enabling in gateway config:

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

### Embeddings

Uses the OpenAI-compatible `/v1/embeddings` endpoint. The `model` field selects the OpenClaw agent
target, and `config.backend_model` can override the backend embedding model with the
`x-openclaw-model` header.

- `openclaw:embedding` - Default agent via Embeddings API
- `openclaw:embedding:<agent-id>` - Custom agent by ID
- `openclaw:embeddings:<agent-id>` - Plural alias (same behavior)

### WebSocket Agent

Uses the native OpenClaw WebSocket RPC protocol for full agent streaming. Connects directly to the gateway's WS port without requiring HTTP endpoint enablement.
Promptfoo includes a stable device identity, signs the gateway `connect.challenge` nonce, persists
issued `hello-ok.auth.deviceToken` values, and retries once with a cached device token when the
gateway reports an `AUTH_TOKEN_MISMATCH`.

- `openclaw:agent` - Default agent via WS
- `openclaw:agent:main` - Explicit agent ID
- `openclaw:agent:<agent-id>` - Custom agent

### Tool Invoke

Invokes a specific tool directly via `POST /tools/invoke`. Useful for testing stable built-in tools
in isolation. The prompt is parsed as JSON for tool arguments.

:::note
If the tool isn't allowlisted by OpenClaw policy, the gateway returns a 404 error. Start with a
stable built-in tool such as `sessions_list` or `session_status`. Tools like `bash` may be renamed,
aliased, or blocked by policy depending on your OpenClaw setup.
:::

:::tip
`POST /tools/invoke` also has an upstream HTTP deny list by default. Expect 404s for tools such as
`sessions_spawn`, `sessions_send`, `cron`, `gateway`, and `whatsapp_login` unless your OpenClaw
policy explicitly changes that behavior.
:::

- `openclaw:tools:sessions_list` - Invoke the sessions_list tool
- `openclaw:tools:session_status` - Invoke the session_status tool

## Configuration

### Auto-Detection

The provider automatically detects the gateway URL and bearer auth secret from the active
OpenClaw config (`OPENCLAW_CONFIG_PATH` when set, otherwise `~/.openclaw/openclaw.json`). This
includes:

- local bind/port resolution
- `OPENCLAW_GATEWAY_PORT` as a local port override
- `gateway.tls.enabled` for `https://` / `wss://`
- `gateway.mode=remote` via `gateway.remote.url`

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
      # Use auth_password instead when gateway.auth.mode=password
      session_key: custom-session
      # Optional backend model override, sent as x-openclaw-model:
      backend_model: openai/gpt-5.4
```

### Environment Variables

Set configuration via environment variables:

```sh
export OPENCLAW_CONFIG_PATH=~/.openclaw/openclaw.json  # optional
export OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
# Or override only the local auto-detected port:
# export OPENCLAW_GATEWAY_PORT=18789
export OPENCLAW_GATEWAY_TOKEN=your-token-here
# Or, if your gateway uses password auth:
# export OPENCLAW_GATEWAY_PASSWORD=your-password-here
```

```yaml title="promptfooconfig.yaml"
providers:
  - openclaw:main
```

## Config Options

| Config Property      | Environment Variable      | Description                                                                              |
| -------------------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| gateway_url          | OPENCLAW_GATEWAY_URL      | Gateway URL (default: auto-detected)                                                     |
| -                    | OPENCLAW_GATEWAY_PORT     | Local gateway port override used when `gateway_url` is unset                             |
| auth_token           | OPENCLAW_GATEWAY_TOKEN    | Gateway bearer secret for token auth mode                                                |
| auth_password        | OPENCLAW_GATEWAY_PASSWORD | Gateway bearer secret for password auth mode                                             |
| backend_model        | -                         | Backend model override sent as `x-openclaw-model`                                        |
| model_override       | -                         | Alias for `backend_model`                                                                |
| message_channel      | -                         | Channel context sent as `x-openclaw-message-channel` and WS `channel`                    |
| account_id           | -                         | Account context sent as `x-openclaw-account-id` and WS `accountId`                       |
| scopes               | -                         | WS operator scopes and optional HTTP `x-openclaw-scopes` context                         |
| session_key          | -                         | Session identifier for continuity; otherwise WS uses an isolated per-call session        |
| thinking_level       | -                         | WS Agent reasoning level: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `adaptive` |
| extra_system_prompt  | -                         | WS Agent-only extra system prompt injected as `extraSystemPrompt`                        |
| device_identity_path | -                         | WS Agent device keypair path (default: promptfoo config directory)                       |
| device_auth_path     | -                         | WS Agent issued-device-token cache path (default: promptfoo config directory)            |
| device_token         | -                         | Explicit WS device token for paired-device auth                                          |
| device_family        | -                         | Optional device metadata included in the signed WS device payload                        |
| disable_device_auth  | -                         | WS Agent break-glass option to omit device identity                                      |
| ws_headers           | -                         | Additional headers for WebSocket connects                                                |
| headers              | -                         | Additional HTTP headers, also used by WS unless overridden by `ws_headers`               |
| action               | -                         | Tool Invoke-only sub-action forwarded as `body.action`                                   |
| dry_run              | -                         | Tool Invoke-only dry-run hint forwarded as `body.dryRun`                                 |
| timeoutMs            | -                         | Client timeout in milliseconds for WS Agent waits and Tool Invoke HTTP requests          |

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

`thinking_level` is only supported by the WebSocket Agent provider. Valid values are `off`,
`minimal`, `low`, `medium`, `high`, `xhigh`, and `adaptive`, though model support still depends on
the upstream provider/model combination.

```yaml title="promptfooconfig.yaml"
prompts:
  - 'Analyze the pros and cons of {{topic}}'

providers:
  - id: openclaw:agent:main
    config:
      session_key: promptfoo-eval
      thinking_level: adaptive
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

### Using Embeddings

```yaml title="promptfooconfig.yaml"
prompts:
  - '{{text}}'

providers:
  - id: openclaw:embedding:main
    config:
      backend_model: openai/text-embedding-3-small

tests:
  - vars:
      text: Promptfoo routes this through OpenClaw.
```

### Backend Model Override

Use `backend_model` when you want the selected OpenClaw agent to run a specific provider/model for
this eval without changing the agent's normal default model.

```yaml title="promptfooconfig.yaml"
providers:
  - id: openclaw:main
    config:
      backend_model: openai/gpt-5.4
```

### WebSocket Agent

Promptfoo uses an isolated session key per call unless you set `session_key` explicitly.

```yaml title="promptfooconfig.yaml"
prompts:
  - '{{task}}'

providers:
  - id: openclaw:agent:main
    config:
      session_key: promptfoo-eval
      timeoutMs: 60000

tests:
  - vars:
      task: What files are in the current directory?
```

### Tool Invoke

```yaml title="promptfooconfig.yaml"
prompts:
  - '{}'

providers:
  - openclaw:tools:sessions_list

tests:
  - assert:
      - type: contains
        value: sessions
```

If a tool exposes sub-actions, add `config.action`:

```yaml title="promptfooconfig.yaml"
prompts:
  - '{}'

providers:
  - id: openclaw:tools:sessions_list
    config:
      action: json
```

## Troubleshooting

- `404` from `openclaw:main` or `openclaw:responses:*`: the HTTP endpoints are disabled by
  default. Enable `gateway.http.endpoints.chatCompletions.enabled=true` and, for Responses,
  `gateway.http.endpoints.responses.enabled=true`.
- `404` from `openclaw:tools:*`: the tool may be blocked by `gateway.tools`, the default HTTP deny
  list, or your selected `tools.profile`. Start with `sessions_list` or `session_status`.
- WS agent auth failures on password-mode gateways: use `auth_password` or
  `OPENCLAW_GATEWAY_PASSWORD`, not `auth_token`.
- WS `DEVICE_AUTH_*` errors usually mean an old or incompatible device identity/signature. Remove
  only the promptfoo OpenClaw device identity/cache files you configured, then pair again.
- If you use unusual proxying or a nonstandard gateway URL, set `gateway_url` explicitly instead of
  relying on auto-detection.

## See Also

For a complete example, see [examples/provider-openclaw](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-openclaw).
