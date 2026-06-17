---
sidebar_label: n8n
sidebar_position: 42
title: n8n Provider
description: Evaluate n8n AI agents and webhook workflows in Promptfoo with templated requests, normalized responses, tool-call metadata, and scoped multi-turn sessions.
---

# n8n

The n8n provider enables testing n8n AI agents and workflows via webhook endpoints. It handles common n8n response formats and supports tool call extraction and session management.

:::tip
Looking to run Promptfoo _from_ n8n? See [Using Promptfoo in n8n Workflows](/docs/integrations/n8n).
:::

## Basic Usage

```yaml
providers:
  - n8n:https://your-n8n-instance.com/webhook/your-workflow-id
```

Promptfoo sends a POST request with:

```json
{
  "prompt": "..."
}
```

The provider automatically extracts output from common n8n response formats including `output`, `response`, `message.content`, `text`, and array responses.
To avoid exposing webhook URLs in stored results or console output, URL-backed n8n provider routes
use a stable `n8n:webhook:<fingerprint>` display ID.

## Configuration

```yaml
providers:
  - id: n8n:https://n8n.example.com/webhook/agent
    config:
      method: POST
      headers:
        Authorization: 'Bearer {{env.N8N_API_KEY}}'
      body:
        message: '{{prompt}}'
        userId: '{{userId}}'
      transformResponse: 'json.agent_response'
```

### Config Options

| Option              | Type          | Default     | Description                                                                     |
| ------------------- | ------------- | ----------- | ------------------------------------------------------------------------------- |
| `url`               | string        | -           | Webhook URL (alternative to provider path)                                      |
| `method`            | string        | `POST`      | `GET`, `POST`, `PUT`, or `PATCH`; `GET` encodes body fields as query parameters |
| `headers`           | object        | -           | Additional request headers with Nunjucks templating                             |
| `body`              | object/string | `{prompt}`  | Request/body-query template; object form is recommended for JSON requests       |
| `transformResponse` | string        | -           | JavaScript expression to extract output                                         |
| `sessionHeader`     | string        | -           | Request header name for the session ID                                          |
| `sessionParser`     | string        | -           | JavaScript expression to extract a session ID                                   |
| `sessionField`      | string        | `sessionId` | Body field name for a supplied session ID                                       |

## Response Formats

The provider handles these n8n response patterns:

```javascript
{ "output": "Response text" }
{ "response": "Agent response" }
{ "message": { "content": "Hello" } }
[{ "json": { "output": "Result" } }]
```

Successful HTTP responses containing a non-empty `error` value, including n8n item responses
such as `[{ "json": { "error": "Workflow failed" } }]`, are reported as provider errors instead
of evaluation output. Empty status values such as `false` or `null` do not turn a successful
response into an error.

## Tool Calls

The provider extracts tool calls from agent responses:

```yaml
tests:
  - vars:
      prompt: "What's my order status?"
    assert:
      - type: javascript
        value: |
          const toolCalls = context.providerResponse?.metadata?.toolCalls || [];
          return toolCalls.some(tc => tc.name === 'order_lookup');
```

Supported formats:

```javascript
{ "tool_calls": [{ "name": "search", "arguments": {...} }] }
{ "actions": [{ "tool": "search", "input": {...} }] }
```

## Session Management

For multi-turn conversations:

```yaml
providers:
  - id: n8n:https://n8n.example.com/webhook/agent
    config:
      sessionField: conversationId
      sessionParser: 'data.sessionId'
```

The provider returns extracted session IDs as `response.sessionId`. Promptfoo's multi-turn
strategies scope that value to the current conversation and supply it to subsequent turns as
`{{sessionId}}`; the provider does not share one implicit session between independent test cases.
For client-generated sessions, supply `sessionId` in test variables or through `transformVars`.

:::warning

Webhook URLs and responses can contain sensitive workflow data. Put authentication values in
templated headers rather than URL query strings or paths, and treat local eval result exports and
debug logs as sensitive. The provider hides webhook URLs in its display identifier and does not
cache webhook requests or responses, so tokenized URLs and session-bearing payloads do not enter
promptfoo response-cache diagnostics or storage. The shared fetch layer now strips basic-auth
credentials and known sensitive query parameters (`api_key`, `token`, `signature`, …) before
writing URLs to debug logs, but path-as-secret URLs (`/webhook/<unguessable-id>`) still appear in
those logs by design — keep `LOG_LEVEL=debug` output out of shared transcripts when running
against tokenized webhooks. URLs remain part of your configuration and the outbound request.

For non-idempotent methods (`POST` / `PATCH`, the default), the provider passes `maxRetries: 0` to
the shared fetch helper. Transient network failures fail through to the caller rather than
re-delivering a workflow that may have already accepted the request and dispatched side-effects
(sending messages, writing to a database). Idempotent methods (`GET` / `PUT`) keep the default
retry budget.

:::

## n8n Variable Conversion

| n8n Format              | Promptfoo Format |
| ----------------------- | ---------------- |
| `{{ $json.query }}`     | `{{query}}`      |
| `{{ $json.user.name }}` | `{{user.name}}`  |

## See Also

- [Using Promptfoo in n8n Workflows](/docs/integrations/n8n)
- [HTTP Provider](/docs/providers/http)
- [Webhook Provider](/docs/providers/webhook)
