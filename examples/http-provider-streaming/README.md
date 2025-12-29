# http-provider-streaming

This example demonstrates streaming response handling with **Time to First Token (TTFT)** measurement using promptfoo's HTTP provider.

## Quick Start

Initialize this example with:

```bash
npx promptfoo@latest init --example http-provider-streaming
```

✅ **Streaming enables important performance metrics**

While promptfoo waits for complete responses, streaming now provides valuable benefits:

- **TTFT Measurement**: Track how quickly models start responding
- **User-Perceived Performance**: Measure streaming responsiveness
- **Model Comparison**: Compare streaming performance across providers
- **Production Insights**: Test streaming implementations before deployment

## Environment Variables

Required:

- `OPENAI_API_KEY` - Your OpenAI API key from `https://platform.openai.com/api-keys`

You can set it in your shell or in a project-level `.env` file (recommended):

```bash
export OPENAI_API_KEY="your-openai-api-key"
# or in .env
OPENAI_API_KEY=your-openai-api-key
```

## Quick Start

1. Set your API key (or ensure `.env` is populated)

2. Run the evaluation (recommended):

   ```bash
   npx promptfoo@latest eval -c examples/http-provider-streaming/promptfooconfig.yaml
   ```

3. View results (optional):

   ```bash
   npx promptfoo@latest view
   ```

## Key Features

### TTFT Measurement

This example uses `stream: true` in the request body to measure Time to First Token:

```yaml
providers:
  - id: https://api.openai.com/v1/chat/completions
    config:
      # TTFT measurement is automatically enabled when stream: true
      stream: true # Enable streaming from API
```

### Performance Assertions

The configuration includes three types of performance tests:

- **Content Quality**: Ensures meaningful output (> 10 characters)
- **TTFT Performance**: Measures time to first token (< 3000ms)
- **Total Latency**: Measures end-to-end response time (< 10000ms)

### Expected Results

- **TTFT**: Typically 200-800ms for current OpenAI models
- **Total Latency**: Usually 2-8 seconds depending on response length
- **Streaming Benefits**: Real-time performance insights

## Caching Behavior

When `stream: true` is set, response caching is disabled to ensure accurate live measurements. This trade-off provides real performance metrics at the cost of caching benefits.

For more HTTP provider configuration options, see the docs: `https://promptfoo.dev/docs/providers/http`.
