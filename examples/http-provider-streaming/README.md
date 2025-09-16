# http-provider-streaming

This example demonstrates how to configure and use HTTP providers with streaming support in promptfoo. It includes a mock streaming server that simulates various streaming response formats commonly used by LLM APIs.

You can run this example with:

```bash
npx promptfoo@latest init --example http-provider-streaming
```

## Purpose

This example showcases the HTTP provider's streaming capabilities, including:

- Server-Sent Events (SSE) streaming (OpenAI-style)
- Simple SSE streaming with custom formats
- Newline-delimited JSON streaming
- Error handling and partial response recovery
- Integration with existing HTTP provider features

## Prerequisites

- Node.js (version 18 or higher)
- No API keys required (uses mock server)

## Quick Start

1. **Start the mock server:**
   ```bash
   node mock-server.js
   ```

2. **Run the streaming evaluation:**
   ```bash
   npx promptfoo@latest eval
   ```

3. **View results:**
   ```bash
   npx promptfoo@latest view
   ```

## Mock Server Endpoints

The included `mock-server.js` provides several streaming endpoints for testing:

- **`POST /v1/chat/completions`** - OpenAI-compatible streaming API
  - Set `{"stream": true}` in request body
  - Returns Server-Sent Events (SSE) format
  - Ends with `[DONE]` marker

- **`POST /stream/simple`** - Simple SSE streaming
  - Returns text chunks in SSE format
  - Ends with `{"done": true}` marker

- **`POST /stream/newline`** - Newline-delimited JSON streaming
  - Each line is a complete JSON object
  - No special end marker

- **`POST /stream/error`** - Error simulation
  - Sends a few chunks then simulates connection failure
  - Useful for testing error handling

- **`GET /health`** - Health check endpoint
  - Non-streaming endpoint for comparison

## Streaming Configuration Examples

### OpenAI-Style Streaming
```yaml
providers:
  - id: http://localhost:3001/v1/chat/completions
    config:
      body:
        stream: true  # Enable streaming on API side
      streaming:
        enabled: true
        format: 'sse'  # Server-Sent Events
        chunkProcessor: 'json.choices[0].delta.content'
        accumulator: 'concat'
        endMarker: '[DONE]'
```

### Simple Streaming Format
```yaml
providers:
  - id: http://localhost:3001/stream/simple
    config:
      streaming:
        enabled: true
        format: 'sse'
        chunkProcessor: 'json.text'
        accumulator: 'concat'
        endMarker: '{"done": true}'
```

### Newline-Delimited JSON
```yaml
providers:
  - id: http://localhost:3001/stream/newline
    config:
      streaming:
        enabled: true
        format: 'newline-delimited'
        chunkProcessor: 'json.text'
        accumulator: 'concat'
```

## Expected Results

When running the example, you should see:

- **OpenAI-style streaming**: Responses assembled from multiple chunks (e.g., "Hello there! How can I help you?")
- **Simple streaming**: Complete responses built incrementally (e.g., "This is a simple streaming response.")
- **Newline-delimited**: Chunks combined properly (e.g., "First chunkSecond chunkThird chunkFinal chunk")

All tests should pass with a 100% success rate, demonstrating that streaming is working correctly.

## Real-World Usage

For production APIs, replace the mock server URL with your actual streaming endpoint:

```yaml
providers:
  - id: https://api.openai.com/v1/chat/completions
    config:
      headers:
        Authorization: 'Bearer {{env.OPENAI_API_KEY}}'
      body:
        model: 'gpt-5'
        messages: [{"role": "user", "content": "{{prompt}}"}]
        stream: true
      streaming:
        enabled: true
        format: 'sse'
        chunkProcessor: 'json.choices[0].delta.content'
        accumulator: 'concat'
        endMarker: '[DONE]'
```

## Debug Mode

Enable debug mode to see streaming chunks in real-time:

```yaml
defaultTest:
  options:
    debug: true
```

This will show individual chunks as they arrive, timing information, and accumulation progress.

## Troubleshooting

### Common Issues

1. **Server not responding**
   - Ensure mock server is running: `node mock-server.js`
   - Check server logs for errors

2. **Chunks not processing**
   - Verify `chunkProcessor` matches your response format
   - Enable debug mode to see raw chunks

3. **Timeouts**
   - Increase `chunkTimeout` for slower streams
   - Check network connectivity

4. **Incomplete responses**
   - Verify `endMarker` matches your API's completion signal
   - Check for connection issues in server logs

## Next Steps

1. Modify the streaming configuration to match your API format
2. Test with your actual streaming endpoints
3. Implement custom chunk processing logic if needed
4. Add authentication and other production requirements
5. Monitor streaming performance and adjust timeouts

For more information, see the [HTTP Provider documentation](https://promptfoo.dev/docs/providers/http#streaming-support).