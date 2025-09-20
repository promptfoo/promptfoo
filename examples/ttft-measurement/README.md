# Time to First Token (TTFT) Measurement Example

This example demonstrates how to measure Time to First Token (TTFT) using promptfoo's HTTP provider with OpenAI's Realtime API streaming responses.

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
  - id: https://api.openai.com/v1/completions
    config:
      enableStreamingMetrics: true  # Enable TTFT measurement
      body:
        model: 'gpt-5-nano'
        stream: true  # Enable streaming from the API
      transformResponse: |
        # Parse Server-Sent Events format for completions API
        # Extract content from streaming chunks
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

- **Model Selection**: The example uses `gpt-5-nano` with the completions API endpoint
- **Threshold Tuning**: Adjust TTFT/latency thresholds based on your requirements
- **Network Impact**: TTFT includes network latency, not just model processing time
- **Accuracy**: Token estimation is approximate; actual tokenization may vary

## Troubleshooting

- **"TTFT assertion requires streaming metrics"**: Ensure `enableStreamingMetrics: true` is set
- **High TTFT values**: Check network latency and API response times
- **Streaming not working**: Verify your `transformResponse` correctly parses the streaming format