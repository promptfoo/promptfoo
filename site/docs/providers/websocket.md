# WebSockets

The WebSocket provider allows you to connect to a WebSocket endpoint for inference. This is useful for real-time, bidirectional communication with a server that supports WebSocket connections.

## Configuration

To use the WebSocket provider, set the provider `id` to `websocket` and provide the necessary configuration in the `config` section.

```yaml
providers:
  - id: 'wss://example.com/ws'
    config:
      messageTemplate: '{"prompt": "{{prompt}}", "model": "{{model}}"}'
      responseParser: 'data.output'
      timeoutMs: 10000
```

### Configuration Options

- `url` (required): The WebSocket URL to connect to.
- `messageTemplate` (required): A template for the message to be sent over the WebSocket connection. You can use placeholders like `{{prompt}}` which will be replaced with the actual prompt.
- `responseParser` (optional): A JavaScript snippet or function to extract the desired output from the WebSocket response given the `data` parameter. If not provided, the entire response will be used as the output. If the response is valid JSON, the object will be returned.
- `timeoutMs` (optional): The timeout in milliseconds for the WebSocket connection. Default is 10000 (10 seconds).

## Using Variables

You can use test variables in your `messageTemplate`:

```yaml
providers:
  - id: 'wss://example.com/ws'
    config:
      messageTemplate: '{"prompt": "{{prompt}}", "model": "{{model}}", "language": "{{language}}"}'
      responseParser: 'data.translation'

tests:
  - vars:
      model: 'gpt-4'
      language: 'French'
```

## Parsing the Response

Use the `responseParser` property to extract specific values from the WebSocket response. For example:

```yaml
providers:
  - id: 'wss://example.com/ws'
    config:
      messageTemplate: '{"prompt": "{{prompt}}"}'
      responseParser: 'data.choices[0].message.content'
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
      responseParser: (data) => data.foobar,
      timeoutMs: 15000,
    }
  }],
}
```

Note that when using the WebSocket provider, the connection will be opened for each API call and closed after receiving the response or when the timeout is reached.
