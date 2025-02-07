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

- `url`: The WebSocket endpoint URL
- `messageTemplate`: Template for formatting messages sent to the WebSocket. Uses Nunjucks templating
- `timeoutMs`: (Optional) Connection timeout in milliseconds. Defaults to 30 seconds
- `transformResponse`: (Optional) Transform the response from the WebSocket. Can be:
  - A simple string path: `choices[0].message.content`
  - A JavaScript function: `(data) => data.output || data`
- `setOrUpdateVars`: (Optional) JavaScript function to manage conversation state and session IDs. Should return an object with:
  - `vars`: Updated variables for the conversation
  - `sessionId`: (Optional) Session ID for maintaining state

## Multi-turn Conversations

The WebSocket provider supports multi-turn conversations through the `setOrUpdateVars` function. This function allows you to:

1. Initialize conversation state (e.g., getting a session ID from your server)
2. Maintain state between turns
3. Update variables that will be available in subsequent messages

For a complete working example, see [examples/websockets-conversation/](https://github.com/promptfoo/promptfoo/tree/main/examples/websockets-conversation/) in the GitHub repository. The example includes:

- A simple WebSocket server that maintains conversation state
- A complete configuration showing conversation management
- Example test cases demonstrating multi-turn conversations

Example of a multi-turn conversation:

```yaml
providers:
  - type: websocket
    url: ws://localhost:4000
    config:
      messageTemplate: '{"prompt": "{{ prompt }}", "conversationId": "{{ conversationId }}"}'
      setOrUpdateVars: |
        // Initialize conversation if needed
        if (!vars.conversationId) {
          const response = await fetch('http://localhost:4000/conversation', {
            method: 'POST'
          });
          const data = await response.json();
          vars.conversationId = data.conversationId;
        }
        return { vars, sessionId: vars.conversationId };

tests:
  - vars:
      question: 'What is this project about?'
  - vars:
      question: 'Can you give me some examples?'
```

## Response Transformation

The `transformResponse` option allows you to extract or modify the WebSocket response:

```yaml
transformResponse: |
  // Simple path
  return data.choices[0].message.content;

  // Or more complex transformation
  if (data.error) {
    return { error: data.error };
  }
  return {
    output: data.choices[0].message.content,
    tokenUsage: data.usage
  };
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
