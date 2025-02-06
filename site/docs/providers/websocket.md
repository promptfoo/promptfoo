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
      maintainConnectionBetweenCalls: true
```

### Configuration Options

- `url` (required): The WebSocket URL to connect to.
- `messageTemplate` (required): A template for the message to be sent over the WebSocket connection. You can use placeholders like `{{prompt}}` which will be replaced with the actual prompt.
- `transformResponse` (optional): A JavaScript snippet or function to extract the desired output from the WebSocket response given the `data` parameter. If not provided, the entire
  response will be used as the output. If the response is valid JSON, the object will be returned.
- `timeoutMs` (optional): The timeout in milliseconds for the WebSocket connection. Default is 30000 (30 seconds).
- `beforeConnect` (optional): A JavaScript function that runs before establishing the WebSocket connection. Useful for getting session tokens or conversation IDs.
- `maintainConnectionBetweenCalls` (optional): If true, keeps the WebSocket connection open between calls. Useful for maintaining conversation state.

## Multi-turn Conversations

The WebSocket provider supports multi-turn conversations by maintaining connection state and conversation history. There are two ways to handle conversation IDs:

### Server-generated Conversation IDs

For a complete working example of server-generated conversation IDs, see [examples/websockets-conversation/](https://github.com/promptfoo/promptfoo/tree/main/examples/websockets-conversation/) in the GitHub repository.

```yaml
providers:
  - id: websocket
    config:
      url: 'ws://localhost:4000'
      maintainConnectionBetweenCalls: true
      messageTemplate: '{"prompt": "{{prompt}}", "conversationId": "{{context.conversationId}}"}'
      beforeConnect: |
        const response = await fetch('http://localhost:4000/conversation', {
          method: 'POST'
        });
        const data = await response.json();
        return { conversationId: data.conversationId };

tests:
  - vars:
      question: 'What is this project about?'
  - vars:
      question: 'Can you give me some examples?'
```

The example includes:

- A simple WebSocket server that maintains conversation state
- A complete configuration showing both server-generated and client-specified conversation IDs
- Example test cases demonstrating multi-turn conversations

### Client-specified Conversation IDs

```yaml
providers:
  - id: websocket
    config:
      url: 'ws://localhost:4000'
      maintainConnectionBetweenCalls: true
      messageTemplate: '{"prompt": "{{prompt}}", "conversationId": "{{conversationId}}"}'

tests:
  - vars:
      question: 'Tell me about features'
      conversationId: features_thread
  - vars:
      question: 'How does testing work?'
      conversationId: features_thread
```

> **Note:** When running with multiple workers, each worker maintains its own WebSocket connections. This means conversation history and connection state is not shared between workers. For multi-turn conversations, it's recommended to run with a single worker or use a different provider type that supports shared state.

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
