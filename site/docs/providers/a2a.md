---
sidebar_label: A2A
title: A2A Provider
description: Use Agent2Agent (A2A) HTTP+JSON agents as providers in promptfoo for evals and red teams
---

# A2A Provider

The `a2a` provider allows you to use agents that implement the
[Agent2Agent protocol](https://a2a-protocol.org/latest/specification/) directly as providers in
promptfoo. This is useful for testing agentic applications that expose an A2A interface for
message-based interaction, streaming responses, and asynchronous task execution.

Promptfoo sends each test prompt as an A2A message, waits for the agent to respond or complete a
task, and extracts the final text from the A2A response. When an Agent Card is available, promptfoo
can also use it to discover the agent endpoint and add advertised skills to red team generation
context.

## Setup

To use the A2A provider, you need an A2A server that supports the HTTP+JSON REST binding. The
current provider supports:

- `POST /message:send`
- `POST /message:stream`
- `GET /tasks/{id}` polling
- Agent Card discovery from `/.well-known/agent-card.json`

JSON-RPC, gRPC, and push-notification webhooks are not supported in this provider yet.

## Basic Configuration

The simplest configuration points promptfoo at the base URL for the A2A HTTP+JSON interface:

```yaml title="promptfooconfig.yaml"
providers:
  - id: a2a:https://agent.example.com/a2a/v1
    config:
      auth:
        type: bearer
        token: '{{ env.A2A_API_KEY }}'
```

The `a2a:<url>` shorthand sets `config.url`. Promptfoo appends the operation paths, such as
`/message:send`, `/message:stream`, and `/tasks/{id}`, to this base URL.

## Agent Card Discovery

If your agent publishes an Agent Card, you can configure `agentCardUrl` instead of hardcoding the
A2A endpoint:

```yaml title="promptfooconfig.yaml"
providers:
  - id: a2a
    config:
      agentCardUrl: https://agent.example.com/.well-known/agent-card.json
      auth:
        type: bearer
        token: '{{ env.A2A_API_KEY }}'
      mode: auto
```

When an Agent Card is configured, promptfoo selects the first supported interface with
`protocolBinding: HTTP+JSON` and uses its URL, tenant, protocol version, and streaming capability
unless you explicitly override them in `config`.

During red team generation, promptfoo also extracts useful Agent Card metadata such as the agent
name, description, capabilities, and skills. This gives the attack generator more target-specific
context, similar to how the MCP provider uses discovered tools.

## Configuration Options

| Option               | Type                         | Default  | Description                                                                 |
| -------------------- | ---------------------------- | -------- | --------------------------------------------------------------------------- |
| `url`                | string                       | -        | Base URL for the A2A HTTP+JSON interface                                    |
| `agentCardUrl`       | string                       | -        | URL of the Agent Card used for endpoint and capability discovery            |
| `auth`               | object                       | -        | Bearer, basic, API key, or OAuth authentication configuration               |
| `headers`            | `Record<string, string>`     | `{}`     | Headers sent to the Agent Card endpoint and A2A operation requests          |
| `mode`               | `auto` \| `send` \| `stream` | `auto`   | Whether to call `message:send`, `message:stream`, or choose automatically   |
| `tenant`             | string                       | -        | Tenant override. Defaults to the selected Agent Card interface tenant       |
| `protocolVersion`    | string                       | `1.0`    | Value for the `A2A-Version` header                                          |
| `polling.enabled`    | boolean                      | `true`   | Poll non-terminal tasks returned by `message:send`                          |
| `polling.intervalMs` | number                       | `1000`   | Delay between `GET /tasks/{id}` polls                                       |
| `polling.timeoutMs`  | number                       | `300000` | Maximum time to wait for task completion                                    |
| `message`            | object                       | -        | Custom A2A message template                                                 |
| `configuration`      | object                       | -        | A2A message configuration sent with each request                            |
| `transformResponse`  | string \| Function           | -        | JavaScript transform for reshaping the final provider response              |
| `timeoutMs`          | number                       | -        | Per-request HTTP timeout. Defaults to promptfoo's provider request timeout. |

## Authentication

Use `auth` for common authentication schemes. Promptfoo applies it to both Agent Card discovery
requests and A2A operation requests. Values support Nunjucks variables, so use the `env` global for
environment variables, such as `{{ env.A2A_API_KEY }}`.

### Bearer Token

```yaml
providers:
  - id: a2a:https://agent.example.com/a2a/v1
    config:
      auth:
        type: bearer
        token: '{{ env.A2A_API_KEY }}'
```

### Basic Auth

```yaml
providers:
  - id: a2a:https://agent.example.com/a2a/v1
    config:
      auth:
        type: basic
        username: '{{ env.A2A_USERNAME }}'
        password: '{{ env.A2A_PASSWORD }}'
```

### API Key

API keys default to the `X-API-Key` header. Set `placement: query` when the server expects a query
parameter instead.

```yaml
providers:
  - id: a2a:https://agent.example.com/a2a/v1
    config:
      auth:
        type: api_key
        keyName: X-API-Key
        value: '{{ env.A2A_API_KEY }}'
```

```yaml
providers:
  - id: a2a:https://agent.example.com/a2a/v1
    config:
      auth:
        type: api_key
        placement: query
        keyName: api_key
        value: '{{ env.A2A_API_KEY }}'
```

### OAuth 2.0

OAuth supports the client credentials and password grants. If `tokenUrl` is omitted, promptfoo tries
OAuth authorization-server metadata discovery from the A2A server URL.

```yaml
providers:
  - id: a2a:https://agent.example.com/a2a/v1
    config:
      auth:
        type: oauth
        grantType: client_credentials
        tokenUrl: https://auth.example.com/oauth/token
        clientId: '{{ env.A2A_CLIENT_ID }}'
        clientSecret: '{{ env.A2A_CLIENT_SECRET }}'
        scopes:
          - a2a.send
```

You can still use `headers` for custom headers that are not authentication-specific. If both
`headers.Authorization` and `auth` produce an `Authorization` header, the `auth` header wins.

## Request Modes

### Auto Mode

`mode: auto` chooses streaming when the Agent Card advertises streaming support. Otherwise it uses
`message:send`.

```yaml
providers:
  - id: a2a
    config:
      agentCardUrl: https://agent.example.com/.well-known/agent-card.json
      mode: auto
```

If you configure only `url` and no Agent Card, `auto` uses `message:send` because promptfoo has no
capability metadata to indicate that streaming is supported.

### Send and Poll

Use `mode: send` to call `POST /message:send`. If the response returns a non-terminal task,
promptfoo polls `GET /tasks/{id}` until the task completes, fails, is canceled, is rejected, or
requires more input/authentication.

```yaml
providers:
  - id: a2a:https://agent.example.com/a2a/v1
    config:
      mode: send
      polling:
        enabled: true
        intervalMs: 1000
        timeoutMs: 300000
```

### Streaming

Use `mode: stream` to call `POST /message:stream` and consume Server-Sent Events (SSE). Promptfoo
returns one final `ProviderResponse` when the stream closes or a terminal task state is reached.

```yaml
providers:
  - id: a2a:https://agent.example.com/a2a/v1
    config:
      mode: stream
```

The provider supports stream events containing `message`, `task`, `statusUpdate`, and
`artifactUpdate` payloads.

## Custom Messages

By default, promptfoo sends a `ROLE_USER` message with a single text part containing `{{prompt}}`.
You can provide a custom message template:

```yaml
providers:
  - id: a2a:https://agent.example.com/a2a/v1
    config:
      message:
        role: ROLE_USER
        parts:
          - text: '{{prompt}}'
      configuration:
        returnImmediately: false
```

Promptfoo renders Nunjucks variables in `message`, `auth`, `headers`, `agentCardUrl`, `url`, and
`configuration`. It also adds a stable `messageId` and uses `sessionId` as the A2A `contextId` when
available.

## Response Transforms

Use `transformResponse` when the A2A response needs to be reshaped before promptfoo evaluates it.
This is useful when your agent returns multiple artifacts, structured data, or metadata that should
be promoted into the final provider response.

```yaml
providers:
  - id: a2a:https://agent.example.com/a2a/v1
    config:
      transformResponse: |
        {
          output: text,
          metadata: { taskId: context.task?.id, mode: context.mode }
        }
```

The transform receives three arguments, matching the HTTP provider convention:

- `json`: The normalized A2A result `{ message, task, events, raw }`
- `text`: Promptfoo's default extracted output
- `context`: A2A metadata `{ message, task, events, raw, mode }`

You can provide the transform as a JavaScript expression, a function, or a file reference:

```yaml
transformResponse: 'file://path/to/parser.js'
```

```javascript
module.exports = (json, text, context) => ({
  output: json.task?.artifacts?.[0]?.parts?.[0]?.text ?? text,
  metadata: { mode: context.mode },
});
```

Return a primitive value to set `output`, or return a full `ProviderResponse` object when you need
fields such as `metadata`, `guardrails`, or `sessionId`. Function and file-based transforms may be
async; promptfoo awaits them before evaluating the response.

For inline JavaScript expressions, `result` is also available as an alias for `json`.

## Output Extraction

If you do not provide `transformResponse`, promptfoo extracts output in this order:

1. Direct A2A `message` text parts
2. Completed task artifact text parts
3. Task status message text
4. Task history text
5. Raw JSON fallback

Text parts are joined with newlines. Structured data remains available through `raw`,
`metadata.a2a`, and `transformResponse`.

### Direct message response

If the agent returns a direct message:

```json
{
  "message": {
    "role": "ROLE_AGENT",
    "parts": [{ "text": "I can help book that flight." }]
  }
}
```

Promptfoo output is:

```text
I can help book that flight.
```

### Completed task artifact

If `message:send` returns a task and polling later returns a completed task with artifacts:

```json
{
  "id": "task-123",
  "status": {
    "state": "TASK_STATE_COMPLETED",
    "message": {
      "role": "ROLE_AGENT",
      "parts": [{ "text": "Completed" }]
    }
  },
  "artifacts": [
    {
      "artifactId": "final-answer",
      "parts": [{ "text": "The best itinerary is SFO to JFK at 9:00 AM." }]
    }
  ]
}
```

Promptfoo output is the artifact text, not the lifecycle status message:

```text
The best itinerary is SFO to JFK at 9:00 AM.
```

### Status message fallback

If there is no direct message and no artifact, promptfoo falls back to task status text:

```json
{
  "id": "task-123",
  "status": {
    "state": "TASK_STATE_COMPLETED",
    "message": {
      "role": "ROLE_AGENT",
      "parts": [{ "text": "Completed with no artifact." }]
    }
  }
}
```

Promptfoo output is:

```text
Completed with no artifact.
```

### Structured output

For agents that return useful non-text fields, use `transformResponse` to shape the output:

```yaml
providers:
  - id: a2a:https://agent.example.com/a2a/v1
    config:
      transformResponse: |
        {
          output: text,
          metadata: {
            taskId: json.task?.id,
            state: json.task?.status?.state,
            eventCount: json.events?.length ?? 0
          }
        }
```

## Red Team Testing with A2A

A2A targets work with normal promptfoo red team configuration. When `agentCardUrl` is configured,
the provider can add Agent Card skills and capabilities to the generated attack context, helping
promptfoo produce probes that are specific to the target agent.

```yaml title="promptfooconfig.yaml"
description: A2A travel agent red team

providers:
  - id: a2a
    config:
      agentCardUrl: https://travel-agent.example.com/.well-known/agent-card.json
      auth:
        type: bearer
        token: '{{ env.A2A_API_KEY }}'

redteam:
  purpose: |
    The system is a travel booking agent that helps users search for flights,
    compare itineraries, and manage reservations.

  plugins:
    - pii
    - bola
    - bfla
    - excessive-agency

  strategies:
    - basic
```

## Error Handling

The A2A provider returns provider errors for common failure cases:

- Agent Card or operation requests return non-2xx HTTP responses
- Responses are not valid JSON
- Streaming responses contain malformed SSE frames
- Tasks reach `TASK_STATE_FAILED`, `TASK_STATE_CANCELED`, or `TASK_STATE_REJECTED`
- Tasks require additional input or authentication
- Polling exceeds `polling.timeoutMs`

## Limitations

- Only the A2A HTTP+JSON REST binding is supported
- JSON-RPC and gRPC bindings are not supported yet
- Push-notification webhooks are not supported because promptfoo evals require a synchronous result
- Streaming is consumed into a single final `ProviderResponse`; token-by-token UI streaming is not exposed
- Agent Card discovery currently selects the first `HTTP+JSON` supported interface

## See Also

- [A2A specification](https://a2a-protocol.org/latest/specification/)
- [A2A definitions](https://a2a-protocol.org/latest/definitions/)
- [MCP Provider](./mcp.md)
- [HTTP Provider](./http.md)
- [Red Team Testing Guide](../red-team/index.md)
