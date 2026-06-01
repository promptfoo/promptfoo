---
sidebar_label: A2A
description: Connect promptfoo to Agent2Agent HTTP+JSON agents
---

# A2A Provider

The A2A provider lets promptfoo evaluate agents that implement the
[Agent2Agent protocol](https://a2a-protocol.org/latest/specification/) HTTP+JSON binding. It sends
test prompts as A2A messages, waits for direct responses or task completion, and extracts final
text from messages, task artifacts, and status messages.

This provider supports:

- `POST /message:send`
- `POST /message:stream`
- `GET /tasks/{id}` polling
- Agent Card discovery through `/.well-known/agent-card.json`

It does not support JSON-RPC, gRPC, or push-notification webhooks.

## Basic usage

```yaml
providers:
  - id: a2a:https://agent.example.com/a2a/v1
    config:
      headers:
        Authorization: Bearer {{A2A_API_KEY}}
      mode: auto
```

The `a2a:<url>` shorthand sets `config.url`. Promptfoo appends the A2A operation paths to this
base URL.

## Agent Card discovery

```yaml
providers:
  - id: a2a
    config:
      agentCardUrl: https://agent.example.com/.well-known/agent-card.json
      headers:
        Authorization: Bearer {{A2A_API_KEY}}
```

When an Agent Card is configured, promptfoo selects the first `HTTP+JSON` supported interface and
uses its URL, tenant, protocol version, and streaming capability unless you explicitly override
them.

## Streaming and polling

```yaml
providers:
  - id: a2a:https://agent.example.com/a2a/v1
    config:
      mode: stream
      polling:
        enabled: true
        intervalMs: 1000
        timeoutMs: 300000
```

`mode: auto` uses streaming when the Agent Card advertises streaming. `mode: send` always calls
`/message:send`; if the response returns a non-terminal task, promptfoo polls `/tasks/{id}` until
the task completes, fails, is canceled, is rejected, or requires more input/authentication.

## Custom messages

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

If `message` is omitted, promptfoo sends a `ROLE_USER` message with a single text part containing
`{{prompt}}`. Promptfoo adds a stable `messageId` and uses `sessionId` as the A2A `contextId` when
available.

## Response transforms

```yaml
providers:
  - id: a2a:https://agent.example.com/a2a/v1
    config:
      transformResponse: |
        (result, text, context) => ({
          output: text,
          metadata: { taskId: context.task?.id, mode: context.mode },
        })
```

The transform receives:

- `result`: `{ message, task, events, raw }`
- `text`: promptfoo's default extracted output
- `context`: `{ message, task, events, raw, mode }`

Return a string or a provider response object such as `{ output, metadata }`.
