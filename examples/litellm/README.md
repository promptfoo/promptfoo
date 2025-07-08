# litellm (LiteLLM Provider Example)

You can run this example with:

```bash
npx promptfoo@latest init --example litellm
```

This example demonstrates how to use LiteLLM with promptfoo for both chat completions and embeddings. LiteLLM provides a unified interface to 400+ LLMs through an OpenAI-compatible API.

## Environment Variables

This example requires a running LiteLLM proxy server. No additional environment variables are needed if using the default configuration.

## Prerequisites

Start a LiteLLM proxy server using Docker:

```bash
docker run -p 4000:4000 \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  ghcr.io/berriai/litellm:main-latest \
  --model gpt-4o-mini \
  --model claude-3-5-sonnet-20241022 \
  --model text-embedding-3-small
```

Or with a config file:

```bash
litellm --config litellm_config.yaml
```

## Running the Example

1. Ensure your LiteLLM server is running on `http://localhost:4000`
2. Run the evaluation:

```bash
npx promptfoo@latest eval
```

## What This Example Shows

- **Chat Completions**: Compares translations across multiple models
- **Embeddings**: Uses LiteLLM's embedding support for similarity assertions
- **Model Comparison**: Evaluates GPT-4o Mini vs Claude 3.5 Sonnet
- **Advanced Assertions**: Demonstrates similarity checks, contains assertions, and LLM rubrics

## Expected Output

The evaluation will show:

- Translation quality comparisons between models
- Similarity scores for translations
- Pass/fail results for each assertion

## Troubleshooting

If you encounter connection errors:

1. Verify the LiteLLM server is running: `curl http://localhost:4000/health`
2. Check that the required models are configured in your LiteLLM server
3. Ensure your API keys are properly set if using cloud providers
