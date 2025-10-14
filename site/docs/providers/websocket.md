---
sidebar_label: WebSockets
description: Configure WebSocket endpoints for real-time LLM inference with custom message templates, response parsing, and secure authentication for bidirectional API integration
---

# WebSockets

The WebSocket provider allows you to connect to a WebSocket endpoint for inference. This is useful for real-time, bidirectional communication. WebSockets are often used to stream messages that contain partial responses to improve the perceived performance of LLM applications. Promptfoo supports a range of implementations from servers that respond with a single message containing the full response, to those that stream a series of partial responses.

## Configuration

To use the WebSocket provider, set the provider `id` to `websocket` and provide the necessary configuration in the `config` section.

```yaml
providers:
  - id: 'wss://example.com/ws'
    config:
      messageTemplate: '{"prompt": "{{prompt}}", "model": "{{model}}"}'
      transformResponse: 'data.output'
      timeoutMs: 300000
      headers:
        Authorization: 'Bearer your-token-here'
```

### Configuration Options

- `url` (required): The WebSocket URL to connect to.
- `messageTemplate` (required): A template for the message to be sent over the WebSocket connection. You can use placeholders like `{{prompt}}` which will be replaced with the actual prompt.
- `transformResponse` (optional): A JavaScript snippet or function to extract the desired output from the WebSocket response given the `data` parameter. If not provided, the entire response will be used as the output. If the response is valid JSON, the object will be returned.
- `streamResponse` (optional): A JavaScript function to extract the desired output from streamed WebSocket messages when the server sends multiple messages per prompt. It receives `(accumulator, data, context?)` and must return `[nextAccumulator, complete]`. When `streamResponse` is provided, it is used instead of `transformResponse`.
- `timeoutMs` (optional): The timeout in milliseconds for the WebSocket connection. Default is 300000 (5 minutes).
- `headers` (optional): A map of HTTP headers to include in the WebSocket connection request. Useful for authentication or other custom headers.

## Using Variables

You can use test variables in your `messageTemplate`:

```yaml
providers:
  - id: 'wss://example.com/ws'
    config:
      messageTemplate: '{"prompt": {{ prompt | dump }}, "model": {{ model | dump }}, "language": {{ language | dump }} }'
      transformResponse: 'data.translation'

tests:
  - vars:
      model: 'gpt-4'
      language: 'French'
```

## Parsing the Response

Use the `transformResponse` property to extract specific values from the WebSocket response. For example:

```yaml
providers:
  - id: 'wss://example.com/ws'
    config:
      messageTemplate: '{"prompt": {{ prompt | dump }} }'
      transformResponse: 'data.choices[0].message.content'
```

This configuration extracts the message content from a response structure similar to:

```json
{
  "choices": [
    {
      "message": {
        "content": "This is the response."
      }
    }
  ]
}
```

## Streaming Responses

Some WebSocket endpoints stream their replies as multiple messages (for example, token-by-token deltas) before sending a final completion. Use `streamResponse` to handle these incremental messages and decide when you're done.

### How `streamResponse` works

- It is called for every incoming WebSocket message and receives:
  - `accumulator`: the current accumulated result. This should be a `ProviderResponse`-shaped object, e.g. `{ output: string }`.
  - `data`: the raw WebSocket message event. Access the payload via `data.data`. If your server sends JSON, you will typically start by parsing this such as: `JSON.parse(data.data)`.
  - `context` (optional): the call context from `callApi`, including test vars and flags.
- It must return a tuple `[result, complete]` where:
  - `result`: the updated accumulated result you want to carry forward.
  - `complete` (boolean): set `true` only when you’ve received the final message and want to stop streaming and return the result.

When `complete` is `false`, promptfoo keeps the WebSocket open and waits for the next message. When `true`, the connection is closed and `result` is returned (after being normalized as a `ProviderResponse`).

:::info
`data` is the browser/Node `MessageEvent`. Most servers send the useful payload in `data.data` as a string. Parse it if needed:

```js
const message = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
```

:::

### Example: Concatenate streamed chunks into a single answer

Imagine your server streams JSON like this while writing a travel suggestion:

```json
{"type":"chunk","text":"You should visit "}
{"type":"chunk","text":"Kyoto in spring."}
{"type":"done"}
```

Here’s a `streamResponse` that concatenates the `text` fields until a `type: done` arrives:

```yaml
providers:
  - id: 'wss://example.com/ws'
    config:
      messageTemplate: '{"prompt": {{ prompt | dump }} }'
      streamResponse: |
        (accumulator, data, context) => {
          const msg = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
          const previous = typeof accumulator?.output === 'string' ? accumulator.output : '';

          if (msg?.type === 'chunk' && typeof msg.text === 'string') {
            return [{ output: previous + msg.text }, false];
          }
          if (msg?.type === 'done') {
            return [{ output: previous }, true];
          }
          return [accumulator, false];
        }
```

This will return a single final string: "You should visit Kyoto in spring." once the `done` message is received.

### Example: Filter out non-final messages using a `complete` flag

Many realtime APIs emit interim deltas and a final message that includes `complete: true`. Suppose the stream contains a friendly recipe generation convo like:

```json
{"role":"assistant","event":"delta","content":"Start by sautéing onions...","complete":false}
{"role":"assistant","event":"delta","content":" then add tomatoes and simmer.","complete":false}
{"role":"assistant","event":"final","content":"Start by sautéing onions, then add tomatoes and simmer.","complete":true}
```

If you only want to score the finished answer (not each partial), set `complete` to `true` only on the final frame and ignore everything else:

```yaml
providers:
  - id: 'wss://example.com/ws'
    config:
      messageTemplate: '{"prompt": {{ prompt | dump }} }'
      streamResponse: |
        (accumulator, data, context) => {
          const msg = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
          if (msg?.complete === true) {
            return [{ output: msg.content }, true];
          }
          // Not complete yet — keep waiting and keep the previous accumulator
          return [accumulator, false];
        }
```

### Example: Accumulate partials and still stop on `complete`

Sometimes you want the best of both worlds: concatenate partials for UI preview, but only finalize when the API says it’s done. A common pattern for customer support answers:

```yaml
providers:
  - id: 'wss://example.com/ws'
    config:
      messageTemplate: '{"prompt": {{ prompt | dump }} }'
      streamResponse: |
        (accumulator, data, context) => {
          const msg = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
          const previous = typeof accumulator?.output === 'string' ? accumulator.output : '';

          if (msg?.event === 'delta' && typeof msg.content === 'string') {
            return [{ output: previous + msg.content }, false];
          }
          if (msg?.complete === true) {
            return [{ output: previous }, true];
          }
          return [accumulator, false];
        }
```

### Referencing a function from a file

For larger handlers, keep the logic in a file and reference it:

```yaml
providers:
  - id: 'wss://example.com/ws'
    config:
      messageTemplate: '{"prompt": {{ prompt | dump }} }'
      streamResponse: 'file://scripts/wsStreamHandler.js'
```

You can also point to a named export: `file://scripts/wsStreamHandler.js:myHandler`.

## Using as a Library

If you are using promptfoo as a node library, you can provide the equivalent provider config:

```js
{
  // ...
  providers: [{
    id: 'wss://example.com/ws',
    config: {
      messageTemplate: '{"prompt": "{{prompt}}"}',
      transformResponse: (data) => data.foobar,
      timeoutMs: 15000,
    }
  }],
}
```

Note that when using the WebSocket provider, the connection will be opened for each API call and closed after receiving the response or when the timeout is reached.

## Reference

Supported config options:

| Option            | Type     | Description                                                                                                                                                        |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| url               | string   | The WebSocket URL to connect to. If not provided, the `id` of the provider will be used as the URL.                                                                |
| messageTemplate   | string   | A template string for the message to be sent over the WebSocket connection. Supports Nunjucks templating.                                                          |
| transformResponse | string   | A function body or string to parse a single response. Ignored when `streamResponse` is provided.                                                                   |
| streamResponse    | Function | A function body, function expression, or `file://` reference that receives `(accumulator, data, context?)` and returns `[result, complete]` for streamed messages. |
| timeoutMs         | number   | The timeout in milliseconds for the WebSocket connection. Defaults to 300000 (5 minutes) if not specified.                                                         |
| headers           | object   | A map of HTTP headers to include in the WebSocket connection request. Useful for authentication or other custom headers.                                           |

Note: The `messageTemplate` supports Nunjucks templating, allowing you to use the `{{prompt}}` variable or any other variables passed in the test context.

In addition to a full URL, the provider `id` field accepts `ws`, `wss`, or `websocket` as values.

:::info
If you're using the OpenAI Realtime provider, you can configure custom endpoints via `apiBaseUrl` (or env vars). The provider automatically converts `https://` → `wss://` and `http://` → `ws://`. See the OpenAI docs: `/docs/providers/openai/#custom-endpoints-and-proxies-realtime`.
:::
