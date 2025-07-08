# LiteLLM Example

This example demonstrates how to use the LiteLLM provider with promptfoo to evaluate multiple models through a unified interface.

## Features

- Chat models (GPT-4, Claude 4, Gemini)
- Embedding models for similarity assertions
- Direct LiteLLM provider usage
- LiteLLM proxy server configuration

## Setup

1. Install dependencies:
   ```bash
   npm install -g promptfoo
   ```

2. Set up environment variables:
   ```bash
   export OPENAI_API_KEY=your-openai-key
   export ANTHROPIC_API_KEY=your-anthropic-key
   export GOOGLE_AI_API_KEY=your-google-key
   ```

3. (Optional) Start LiteLLM proxy server:
   ```bash
   litellm --config litellm_config.yaml
   ```

## Running the Evaluation

### Direct provider usage (no proxy):
```bash
promptfoo eval
```

### With proxy server:
```bash
# Start the proxy first
litellm --config litellm_config.yaml

# In another terminal
promptfoo eval -c promptfooconfig-proxy.yaml
```

## Configuration Files

- `promptfooconfig.yaml` - Direct LiteLLM provider usage
- `promptfooconfig-proxy.yaml` - Using LiteLLM through proxy server
- `litellm_config.yaml` - LiteLLM proxy configuration

## Supported Models

This example uses:
- OpenAI GPT-4.1 Mini
- Anthropic Claude 4 Sonnet
- Google Gemini 1.5 Flash
- OpenAI Text Embedding 3 Large

See [LiteLLM docs](https://docs.litellm.ai/docs/providers) for all 400+ supported models.

## Environment Variables

This example requires a running LiteLLM proxy server. No additional environment variables are needed if using the default configuration.

## Prerequisites

Start a LiteLLM proxy server using Docker:

```bash
docker run -p 4000:4000 \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  ghcr.io/berriai/litellm:main-latest \
  --model gpt-4.1-mini \
  --model claude-4-sonnet \
  --model text-embedding-3-large
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
- **Model Comparison**: Evaluates GPT-4.1 Mini vs Claude 4 Sonnet
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
