# provider-http/streaming (HTTP Provider Streaming Example)

This example demonstrates streaming response handling with **Time to First Token (TTFT)** measurement using promptfoo's HTTP provider.

Initialize this example with:

```bash
npx promptfoo@latest init --example provider-http/streaming
cd provider-http/streaming
```

## Why Stream?

While promptfoo waits for complete responses before scoring, streaming unlocks additional performance insights:

- **TTFT Measurement**: Track how quickly models start responding
- **User-Perceived Performance**: Measure streaming responsiveness
- **Model Comparison**: Compare streaming performance across providers
- **Production Insights**: Validate streaming implementations before deployment

## Environment Variables

Required:

- `OPENAI_API_KEY` - Your OpenAI API key from `https://platform.openai.com/api-keys`

You can set it in your shell or in a project-level `.env` file (recommended):

```bash
export OPENAI_API_KEY="your-openai-api-key"
# or in .env
OPENAI_API_KEY=your-openai-api-key
```

## Running the Example

1. Set your API key (or ensure `.env` is populated)

2. Run the evaluation:

   ```bash
   npx promptfoo@latest eval -c examples/provider-http/streaming/promptfooconfig.yaml
   ```

3. View results (optional):

   ```bash
   npx promptfoo@latest view
   ```

## Key Features

### TTFT Measurement

This example uses `stream: true` in the request body to enable TTFT measurement, and `streamFormat: openai-chat` to pin TTFT to the first model-emitted content token rather than the first SSE framing frame:

```yaml
providers:
  - id: https://api.openai.com/v1/chat/completions
    config:
      body:
        stream: true # Enable streaming (required for TTFT)
      streamFormat: openai-chat # Canonical "first content token" TTFT
```

Supported `streamFormat` values: `openai-chat`, `openai-responses`, `anthropic-messages`. If your endpoint is not one of these, use `streamFirstTokenPattern` with a custom regex, or omit both and TTFT falls back to "first non-whitespace response byte" (a format-agnostic wire-level proxy).

### Performance Assertions

The configuration includes three types of performance tests:

- **Content Quality**: Ensures meaningful output (> 10 characters)
- **TTFT Performance**: Measures time to first content token (< 3000ms)
- **Total Latency**: Measures end-to-end response time (< 10000ms)

### Expected Results

Inspect the measured TTFT and total latency from your own environment. Both depend on the selected model, prompt, endpoint region, and network path.

## Reasoning Models

Reasoning models (OpenAI `gpt-5`/`gpt-5-mini`/`o1`/`o3`, DeepSeek R1, etc.) do not emit output tokens until internal reasoning completes. For these, TTFT ≈ total latency and the metric loses its signal. Prefer non-reasoning models (`gpt-4o-mini`, `gpt-4o`, Claude Haiku/Sonnet) when comparing streaming performance.

## Caching Behavior

When `stream: true` is set, response caching is disabled so every TTFT measurement reflects a live call.

For more HTTP provider configuration options, see the docs: `https://promptfoo.dev/docs/providers/http`.
