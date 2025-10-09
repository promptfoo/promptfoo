# websocket-streaming (OpenAI Realtime API)

Test OpenAI's Realtime API via WebSocket streaming with promptfoo.

## Quick Start

```bash
npx promptfoo@latest init --example websocket-streaming
npx promptfoo@latest eval
```

## Overview

This example demonstrates how to use promptfoo with WebSocket streaming endpoints, specifically the OpenAI Realtime API. It shows how to:

1. Connect to streaming WebSocket APIs
2. Accumulate streaming chunks in real-time
3. Handle different event types and formats
4. Test both production APIs and local servers

## Configuration

### OpenAI Realtime API

```yaml
providers:
  - id: wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01
    config:
      # Enable streaming mode
      stream: true

      # OpenAI-specific event types
      streamChunkType: 'response.audio_transcript.delta'
      streamDoneType: 'response.audio_transcript.done'
      streamDeltaField: 'delta'

      # Message format for Realtime API
      messageTemplate: |
        {
          "type": "conversation.item.create",
          "item": {
            "type": "message",
            "role": "user",
            "content": [{"type": "input_text", "text": "{{prompt}}"}]
          }
        }

      # Authentication
      headers:
        Authorization: 'Bearer {{env.OPENAI_API_KEY}}'

      timeoutMs: 30000
```

### Local Test Server

A simple local WebSocket server is included for testing without API costs:

```yaml
providers:
  - id: websocket://localhost:8080
    config:
      stream: true
      messageTemplate: '{"prompt": "{{prompt}}", "stream": true}'
```

## Running the Example

### 1. With OpenAI Realtime API

Set your API key:

```bash
export OPENAI_API_KEY=your-api-key
```

Run the evaluation:

```bash
npx promptfoo@latest eval
```

### 2. With Local Test Server

Start the test server:

```bash
node server.js
```

In a new terminal, run promptfoo with the local provider:

```bash
npx promptfoo@latest eval --filter-provider local-streaming
```

Or modify the config to use only the local provider.

## WebSocket Streaming Configuration

### Flexible Streaming with `transformStream` (Recommended)

The `transformStream` option provides maximum flexibility for handling any streaming format:

```yaml
providers:
  - id: websocket://localhost:8080
    config:
      messageTemplate: '{"prompt": "{{prompt}}"}'
      transformStream: |
        (context) => {
          const { message, messages } = context;

          // Check for completion
          if (message.type === 'done') {
            const chunks = messages
              .filter(m => m.type === 'chunk' && m.delta)
              .map(m => m.delta);
            return { done: true, output: chunks.join('') };
          }

          // Check for errors
          if (message.type === 'error') {
            return { done: true, error: message.error };
          }

          // Continue streaming
          return {};
        }
```

**Transform Context:**
- `context.message` - The current/latest message
- `context.messages` - All messages received so far (array)

**Return Value:**
- `{done: true, output: string}` - Streaming complete, return output
- `{done: true, error: string}` - Error occurred
- `{}` - Continue streaming

**File-Based Transforms:**

```yaml
transformStream: file://stream-transforms/simple-chunk.js
```

See the `stream-transforms/` directory for examples handling different formats.

### Required Options

| Option | Description |
|--------|-------------|
| `messageTemplate` | Nunjucks template for the WebSocket message |

### Streaming Options

| Option | Default | Description |
|--------|---------|-------------|
| `transformStream` | - | **Recommended**: Callback function or file path for custom streaming logic |
| `stream` | `false` | **(Deprecated)** Set to `true` to enable legacy streaming mode |
| `streamChunkType` | `'chunk'` | **(Deprecated)** Event type indicating a streaming chunk |
| `streamDoneType` | `'done'` | **(Deprecated)** Event type indicating stream completion |
| `streamDeltaField` | `'delta'` | **(Deprecated)** Field name containing the chunk content |

### General Options

| Option | Default | Description |
|--------|---------|-------------|
| `url` | - | WebSocket URL (can be in provider `id`) |
| `timeoutMs` | `10000` | Request timeout in milliseconds |
| `transformResponse` | - | Transform the final accumulated response |
| `headers` | - | Custom headers for the connection |

## How Streaming Works

### With `transformStream` (Recommended)

1. **Connection** - WebSocket connection established
2. **Message Sent** - Your `messageTemplate` is sent
3. **Each Message** - Your `transformStream` function is called with:
   - `context.message` - The current message
   - `context.messages` - All messages received so far
4. **Continue or Complete** - Your function returns:
   - `{}` to continue streaming
   - `{done: true, output: string}` to complete successfully
   - `{done: true, error: string}` on error
5. **Transform** - Optional `transformResponse` processes the final result

### Example with `transformStream`

```javascript
// Stream transform function
(context) => {
  const { message, messages } = context;

  // Message 1: {"type": "chunk", "delta": "Hello, "}
  // Return {} to continue

  // Message 2: {"type": "chunk", "delta": "how "}
  // Return {} to continue

  // Message 3: {"type": "chunk", "delta": "are you?"}
  // Return {} to continue

  // Message 4: {"type": "done"}
  if (message.type === 'done') {
    const chunks = messages
      .filter((m) => m.type === 'chunk' && m.delta)
      .map((m) => m.delta);
    return { done: true, output: chunks.join('') };
    // Returns: "Hello, how are you?"
  }

  return {};
};
```

### Legacy Mode (Deprecated)

When `stream: true` is enabled without `transformStream`:

1. **Connection** - WebSocket connection established
2. **Message Sent** - Your `messageTemplate` is sent
3. **Chunks Accumulate** - Each `streamChunkType` event's `streamDeltaField` is accumulated
4. **Completion** - When `streamDoneType` is received, the full accumulated text is returned
5. **Transform** - Optional `transformResponse` processes the final result

## Comparison with HTTP Streaming

### HTTP Provider (manual accumulation)

```yaml
transformResponse: |
  (json, text) => {
    let out = '';
    for (const line of text.split('\n')) {
      if (line.startsWith('data: ')) {
        const evt = JSON.parse(line.slice(6));
        if (evt.delta) out += evt.delta;
      }
    }
    return out;
  }
```

### WebSocket Provider (flexible streaming)

```yaml
config:
  transformStream: |
    (context) => {
      const { message, messages } = context;
      if (message.type === 'done') {
        const chunks = messages
          .filter(m => m.type === 'chunk' && m.delta)
          .map(m => m.delta);
        return { done: true, output: chunks.join('') };
      }
      return {};
    }
```

The WebSocket provider handles real-time event processing with flexible control over accumulation logic.

## Testing the Local Server

The included `server.js` simulates OpenAI-style streaming:

### Start Server

```bash
node server.js
```

### Test in Browser

Open http://localhost:8080 to use the interactive web interface.

### Test with Promptfoo

```bash
npx promptfoo@latest eval --filter-provider local-streaming
```

## Advanced Usage

### File-Based Stream Transforms

Create reusable transform files for different streaming formats:

**`stream-transforms/custom-format.js`:**

```javascript
module.exports = (context) => {
  const { message, messages } = context;

  // Custom streaming logic
  if (message.type === 'complete') {
    const parts = messages
      .filter((m) => m.type === 'message' && m.text)
      .map((m) => m.text);
    return { done: true, output: parts.join('') };
  }

  if (message.error) {
    return { done: true, error: message.error };
  }

  return {};
};
```

**Use in config:**

```yaml
providers:
  - id: wss://custom-api.example.com
    config:
      transformStream: file://stream-transforms/custom-format.js
```

### Response Transformation

Process the final accumulated response:

```yaml
config:
  transformStream: |
    (context) => {
      if (context.message.type === 'done') {
        return {
          done: true,
          output: context.messages.map(m => m.delta).join(''),
        };
      }
      return {};
    }
  transformResponse: 'data.trim().replace(/\\s+/g, " ")'
```

### Legacy Mode (Deprecated)

For simple streaming formats, the legacy field-based configuration is still supported:

```yaml
providers:
  - id: wss://custom-api.example.com
    config:
      stream: true
      streamChunkType: 'message' # Your event type
      streamDoneType: 'complete' # Your completion type
      streamDeltaField: 'text' # Your field name
```

**Note:** `transformStream` is recommended for all new implementations.

### Authentication Patterns

```yaml
# Bearer token
headers:
  Authorization: 'Bearer {{env.API_KEY}}'

# Custom auth header
headers:
  X-API-Key: '{{env.API_KEY}}'

# Multiple headers
headers:
  Authorization: 'Bearer {{env.API_KEY}}'
  X-Organization: '{{env.ORG_ID}}'
```

## OpenAI Realtime API Details

The Realtime API uses Server-Sent Events over WebSocket with specific event types:

### Common Event Types

- `session.created` - Session initialized
- `response.audio_transcript.delta` - Text chunk
- `response.audio_transcript.done` - Transcription complete
- `response.done` - Full response complete
- `error` - Error occurred

### Sending Messages

```json
{
  "type": "conversation.item.create",
  "item": {
    "type": "message",
    "role": "user",
    "content": [
      {
        "type": "input_text",
        "text": "Your prompt here"
      }
    ]
  }
}
```

See the [OpenAI Realtime API docs](https://platform.openai.com/docs/guides/realtime) for complete details.

## Troubleshooting

### Connection Timeout

- Increase `timeoutMs` in your config
- Check your API key is valid
- Verify the WebSocket URL is correct

### No Streaming Response

- Verify `stream: true` is set
- Check `streamChunkType` matches your server's events
- Review `streamDeltaField` matches the field name in chunks

### Authentication Errors

- Ensure `OPENAI_API_KEY` environment variable is set
- Check the API key has Realtime API access
- Verify the `Authorization` header format

### Local Server Issues

```bash
# Check if server is running
curl http://localhost:8080

# View server logs
node server.js

# Test WebSocket connection
# (use browser developer tools or wscat)
npm install -g wscat
wscat -c ws://localhost:8080
```

## Next Steps

- Modify prompts in `promptfooconfig.yaml`
- Add custom assertions for response quality
- Integrate with your own WebSocket API
- Extend `server.js` for custom behaviors

## Related Examples

- `http-streaming` - HTTP-based streaming responses
- `openai-assistants` - OpenAI Assistants API
- `custom-provider` - Building custom providers
