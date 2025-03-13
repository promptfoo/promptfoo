# WebSockets

The WebSocket provider allows you to connect to a WebSocket endpoint for inference. This is useful for real-time, bidirectional communication with a server that supports WebSocket connections.

## Configuration

To use the WebSocket provider, set the provider `id` to `websocket` and provide the necessary configuration in the `config` section.

```yaml
providers:
  - id: 'wss://example.com/ws'
    config:
      messageTemplate: '{"prompt": "{{prompt}}", "model": "{{model}}"}'
      transformResponse: 'data.output'
      timeoutMs: 10000
```

### Configuration Options

- `url` (required): The WebSocket URL to connect to.
- `messageTemplate` (required): A template for the message to be sent over the WebSocket connection. You can use placeholders like `{{prompt}}` which will be replaced with the actual prompt.
- `transformResponse` (optional): A JavaScript snippet or function to extract the desired output from the WebSocket response given the `data` parameter. If not provided, the entire response will be used as the output. If the response is valid JSON, the object will be returned.
- `timeoutMs` (optional): The timeout in milliseconds for the WebSocket connection. Default is 10000 (10 seconds).

## Using Variables

You can use test variables in your `messageTemplate`:

```yaml
providers:
  - id: 'wss://example.com/ws'
    config:
      messageTemplate: '{"prompt": "{{prompt}}", "model": "{{model}}", "language": "{{language}}"}'
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
      messageTemplate: '{"prompt": "{{prompt}}"}'
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

| Option            | Type               | Description                                                                                                                                   |
| ----------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| url               | string             | The WebSocket URL to connect to. If not provided, the `id` of the provider will be used as the URL.                                           |
| messageTemplate   | string             | A template string for the message to be sent over the WebSocket connection. Supports Nunjucks templating.                                     |
| transformResponse | string \| Function | A function or string representation of a function to parse the response. If not provided, the entire response will be returned as the output. |
| timeoutMs         | number             | The timeout in milliseconds for the WebSocket connection. Defaults to 10000 (10 seconds) if not specified.                                    |

Note: The `messageTemplate` supports Nunjucks templating, allowing you to use the `{{prompt}}` variable or any other variables passed in the test context.

In addition to a full URL, the provider `id` field accepts `ws`, `wss`, or `websocket` as values.
