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

| Option              | Type          | Default     | Description                                         |
| ------------------- | ------------- | ----------- | --------------------------------------------------- |
| `url`               | string        | -           | Webhook URL (alternative to provider path)          |
| `method`            | string        | `POST`      | HTTP method                                         |
| `headers`           | object        | -           | Additional request headers with Nunjucks templating |
| `body`              | object/string | `{prompt}`  | Request body template                               |
| `transformResponse` | string        | -           | JavaScript expression to extract output             |
| `sessionHeader`     | string        | -           | Request header name for the session ID              |
| `sessionParser`     | string        | -           | JavaScript expression to extract a session ID       |
| `sessionField`      | string        | `sessionId` | Body field name for a supplied session ID           |

## Response Formats

The provider handles these n8n response patterns:

```javascript
{ "output": "Response text" }
{ "response": "Agent response" }
{ "message": { "content": "Hello" } }
[{ "json": { "output": "Result" } }]
```

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
templated headers rather than URL query strings, and treat local eval result exports as sensitive.

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
