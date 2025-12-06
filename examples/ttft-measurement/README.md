# ttft-measurement

This example demonstrates how to measure Time to First Token (TTFT) using promptfoo's HTTP provider with OpenAI's Chat Completions API streaming responses.

> **Note**: TTFT measurement is automatically enabled when `stream: true` is set in the request body. No additional configuration is required.

## Quick Start

Initialize this example with:

```bash
npx promptfoo@latest init --example ttft-measurement
```

## What is TTFT?

Time to First Token (TTFT) measures how quickly an AI model starts generating a response. It's crucial for user experience in streaming applications where you want to show users that the model is "thinking" and starting to respond as quickly as possible.

## Features Demonstrated

- **Streaming Response Handling**: Uses OpenAI's streaming API via HTTP provider
- **TTFT Measurement**: Tracks time from request start to first meaningful token
- **Multiple Assertions**: Tests both TTFT and total latency
- **Backward Compatibility**: Works alongside existing latency assertions

## Configuration

The key configuration options for TTFT measurement:

```yaml
providers:
  - id: https://api.openai.com/v1/chat/completions
    config:
      body:
        model: 'gpt-5-mini'
        messages:
          - role: 'user'
            content: '{{prompt}}'
        stream: true # Automatically enables TTFT measurement
      transformResponse: |
        # Parse OpenAI streaming SSE format
        (json, text) => {
          if (json?.choices?.[0]?.message?.content) {
            return json.choices[0].message.content;
          }
          let content = '';
          for (const line of String(text || '').split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue;
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.choices?.[0]?.delta?.content) {
                content += data.choices[0].delta.content;
              }
            } catch {}
          }
          return content.trim();
        }
```

## Assertions

Two timing-related assertions are used:

```yaml
assert:
  # TTFT should be under 2 seconds
  - type: ttft
    threshold: 2000

  # Total response time should be under 10 seconds
  - type: latency
    threshold: 10000
```

## Requirements

1. **OpenAI API Key**: Set `OPENAI_API_KEY` environment variable
   - Sign up at [OpenAI Platform](https://platform.openai.com/)
   - Navigate to the API Keys section
   - Create a new secret key
   - Set it as an environment variable or in a `.env` file

2. **Streaming Support**: The target API must support Server-Sent Events or similar streaming format
3. **Response Transform**: Must parse the streaming format correctly

## Running the Example

```bash
# Set your OpenAI API key
export OPENAI_API_KEY="your-api-key"

# Run the evaluation
promptfoo eval -c promptfooconfig.yaml

# View results
promptfoo view
```

## Understanding the Results

The evaluation will show:

- **TTFT**: Time to first token in milliseconds
- **Latency**: Total response time in milliseconds
- **Tokens/sec**: Approximate streaming throughput
- **Pass/Fail**: Whether timing thresholds were met

## Notes

- **Model Selection**: The example uses `gpt-5-mini` with the Chat Completions API (`/v1/chat/completions`)
- **Auto-Detection**: TTFT measurement is automatically enabled when `stream: true` is in the request body
- **Threshold Tuning**: Adjust TTFT/latency thresholds based on your requirements
- **Network Impact**: TTFT includes full network latency (TCP handshake, TLS, HTTP headers), not just model processing time
- **Token Counting**: Uses rough approximation (4 chars ≈ 1 token); may be inaccurate for non-English text or code
- **Caching Behavior**: When `stream: true` is set, response caching is disabled to ensure live TTFT measurement
- **Performance Trade-off**: Streaming responses sacrifice caching for real-time timing metrics

## Troubleshooting

- **"TTFT assertion requires streaming metrics"**: Ensure `stream: true` is set in the request body
- **High TTFT values**: Check network latency and API response times
- **Streaming not working**: Verify your `transformResponse` correctly parses the streaming format
- **Inconsistent TTFT measurements**: Remember that caching is disabled for streaming - each request hits the live API
- **Performance concerns**: Use streaming metrics only when measuring TTFT; standard requests benefit from caching
