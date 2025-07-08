# litellm

You can run this example with:

```bash
npx promptfoo@latest init --example litellm
```

This example demonstrates how to use the LiteLLM provider with promptfoo to evaluate multiple models through a unified interface.

## Features

- Chat models (GPT-4, Claude 4, Gemini)
- Embedding models for similarity assertions
- Direct LiteLLM provider usage
- LiteLLM proxy server configuration

## Prerequisites

LiteLLM provides a unified interface to 400+ LLMs. You can use it in several ways:

### Option 1: Direct Provider Usage (No Proxy)

When using LiteLLM directly, promptfoo will make API calls directly to the underlying providers (OpenAI, Anthropic, etc.). You'll need the appropriate API keys for each provider.

### Option 2: LiteLLM Proxy Server

Run a LiteLLM proxy server that handles authentication and routing to various providers. This is useful for:
- Centralized API key management
- Load balancing and fallbacks
- Cost tracking and rate limiting
- Using models that require special authentication

## Environment Variables

Set up the required API keys based on your usage method:

### For Direct Usage:
```bash
export OPENAI_API_KEY=your-openai-key      # For GPT models
export ANTHROPIC_API_KEY=your-anthropic-key # For Claude models
export GOOGLE_AI_API_KEY=your-google-key    # For Gemini models
```

### For Proxy Server:
```bash
export LITELLM_API_KEY=your-litellm-key     # If your proxy requires authentication
```

## Connection Methods

### Method 1: Direct Provider Usage (Default)

This is the simplest method - promptfoo connects directly to LiteLLM which then routes to the appropriate provider:

```yaml
providers:
  - id: litellm:gpt-4.1-mini
  - id: litellm:claude-4-sonnet
  - id: litellm:embedding:text-embedding-3-large
```

Run evaluation:
```bash
npx promptfoo@latest eval
```

### Method 2: LiteLLM Proxy Server

Start a LiteLLM proxy server to centralize model access:

#### Using Docker:
```bash
docker run -p 4000:4000 \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  ghcr.io/berriai/litellm:main-latest \
  --model gpt-4.1-mini \
  --model claude-4-sonnet \
  --model text-embedding-3-large
```

#### Using Python:
```bash
pip install litellm
litellm --model gpt-4.1-mini --model claude-4-sonnet
```

#### Using Config File:
```bash
litellm --config litellm_config.yaml
```

Then configure promptfoo to use the proxy:

```yaml
providers:
  - id: litellm:gpt-4.1-mini
    config:
      apiBaseUrl: http://localhost:4000
      apiKey: ${LITELLM_API_KEY}  # Optional, if proxy requires auth
```

### Method 3: Custom LiteLLM Server URL

If you have LiteLLM running on a different host or port:

```yaml
providers:
  - id: litellm:gpt-4.1-mini
    config:
      apiBaseUrl: https://your-litellm-server.com
      apiKey: ${LITELLM_API_KEY}
```

### Method 4: Using OpenAI Provider (Alternative)

Since LiteLLM is OpenAI-compatible, you can also use the OpenAI provider:

```yaml
providers:
  - id: openai:chat:gpt-4.1-mini
    config:
      apiBaseUrl: http://localhost:4000
      apiKey: ${LITELLM_API_KEY}
```

## Configuration Files

- `promptfooconfig.yaml` - Example configuration for direct LiteLLM usage
- `litellm_config.yaml` - LiteLLM proxy server configuration

## Supported Models

This example uses:
- OpenAI GPT-4.1 Mini (chat)
- Anthropic Claude 4 Sonnet (chat)
- Google Gemini 1.5 Flash (chat)
- OpenAI Text Embedding 3 Large (embeddings)

See [LiteLLM docs](https://docs.litellm.ai/docs/providers) for all 400+ supported models.

## What This Example Shows

- **Chat Completions**: Compares translations across multiple models
- **Embeddings**: Uses LiteLLM's embedding support for similarity assertions
- **Model Comparison**: Evaluates different providers through a unified interface
- **Advanced Assertions**: Demonstrates similarity checks, contains assertions, and custom validation

## Expected Output

The evaluation will show:
- Translation quality comparisons between models
- Similarity scores for translations using embeddings
- Pass/fail results for each assertion
- Performance metrics for each model

## Troubleshooting

### Connection Issues

1. **Direct usage**: Ensure API keys are set correctly:
   ```bash
   echo $OPENAI_API_KEY
   echo $ANTHROPIC_API_KEY
   ```

2. **Proxy server**: Verify the server is running:
   ```bash
   curl http://localhost:4000/health
   ```

3. **Check model availability**: Some models may require specific API keys or permissions

### Common Errors

- **"API key not found"**: Set the appropriate environment variables
- **"Model not found"**: Check the model name matches LiteLLM's supported models
- **"Connection refused"**: Ensure the LiteLLM proxy is running if using proxy mode

## Advanced Usage

### Load Balancing

Configure multiple instances of the same model for load balancing:

```yaml
# litellm_config.yaml
model_list:
  - model_name: gpt-4.1-mini
    litellm_params:
      model: openai/gpt-4.1-mini
      api_key: ${OPENAI_API_KEY}
    
  - model_name: gpt-4.1-mini  # Same name for load balancing
    litellm_params:
      model: azure/gpt-4-mini
      api_key: ${AZURE_API_KEY}
      api_base: ${AZURE_ENDPOINT}
```

### Custom Parameters

Pass provider-specific parameters:

```yaml
providers:
  - id: litellm:claude-4-sonnet
    config:
      temperature: 0.7
      max_tokens: 2000
      top_p: 0.9
      # Any LiteLLM-supported parameter
```

## Learn More

- [LiteLLM Documentation](https://docs.litellm.ai/docs/)
- [Promptfoo LiteLLM Provider Docs](/docs/providers/litellm)
- [LiteLLM Proxy Setup](https://docs.litellm.ai/docs/proxy/quick_start)
