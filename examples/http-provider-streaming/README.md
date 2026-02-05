# http-provider-streaming (HTTP Provider Streaming Example)

This example shows how to use OpenAI's streaming API via HTTP provider.

You can run this example with:

```bash
npx promptfoo@latest init --example http-provider-streaming
```

⚠️ **Streaming is not recommended for evaluations**

Promptfoo supports streaming HTTP targets, but evals wait for full responses before scoring. That means:

- No progressive display during evals
- Extra parsing complexity for streaming formats (SSE/chunked)
- Similar end-to-end latency vs. non-streaming

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

For more HTTP provider configuration options, see the docs: `https://promptfoo.dev/docs/providers/http`.
