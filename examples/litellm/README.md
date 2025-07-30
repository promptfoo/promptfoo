# litellm

You can run this example with:

```bash
npx promptfoo@latest init --example litellm
```

This example demonstrates how to use the LiteLLM provider with promptfoo to evaluate multiple models through a unified interface.

## What is LiteLLM?

LiteLLM provides a unified interface to 400+ LLMs. Instead of managing different APIs and authentication methods for each provider, you can use a single interface to access models from OpenAI, Anthropic, Google, and many more.

## Quick Start

1. **Set your API keys**:

   ```bash
   export OPENAI_API_KEY=your-openai-key
   # Optional: Add other providers
   export ANTHROPIC_API_KEY=your-anthropic-key
   export GOOGLE_AI_API_KEY=your-google-key
   ```

2. **Start the LiteLLM proxy**:

   ```bash
   # Use the provided script
   ./start-proxy.sh

   # Or manually:
   pip install litellm[proxy]
   litellm --model gpt-4.1 --model claude-sonnet-4-20250514 --model gemini-2.5-pro --model text-embedding-3-large
   ```

3. **Run the evaluation**:
   ```bash
   npx promptfoo@latest eval
   ```

## Features

- **Unified Interface**: Access OpenAI, Anthropic, Google, and 400+ other models through one API
- **Chat Models**: GPT-4.1, Claude Sonnet 4, Gemini 2.5
- **Embedding Models**: Support for similarity assertions via embedding models
- **Simple Configuration**: One provider syntax for all models
- **Cost Tracking**: LiteLLM proxy can track usage across providers
- **Load Balancing**: Distribute requests across multiple instances

## How It Works

The LiteLLM provider in promptfoo connects to a LiteLLM proxy server (default port 4000). The proxy handles:

- Authentication and routing to various providers
- Standardizing request/response formats
- Error handling and retries
- Optional features like caching and rate limiting

## Configuration Files

- `promptfooconfig.yaml` - Main evaluation configuration
- `litellm_config.yaml` - LiteLLM proxy server configuration
- `start-proxy.sh` - Helper script to start the proxy

## Example Configuration

The example evaluates translation and creative writing tasks across three different providers:

```yaml
providers:
  - litellm:gpt-4.1
  - litellm:claude-sonnet-4-20250514
  - litellm:gemini-2.5-pro

defaultTest:
  options:
    provider:
      embedding: litellm:embedding:text-embedding-3-large
```

## Troubleshooting

### Common Errors

- **"Connection refused 0.0.0.0:4000"**: The LiteLLM proxy server is not running. Start it first with `./start-proxy.sh`
- **"API key not found"**: Set the appropriate environment variables before starting the proxy
- **"Model not found"**: Ensure the model is included when starting the proxy server

### Verify Setup

1. **Check proxy is running**:

   ```bash
   curl http://localhost:4000/health
   ```

2. **Verify API keys**:
   ```bash
   echo $OPENAI_API_KEY
   ```

## Advanced Usage

### Custom Server URL

If your LiteLLM proxy runs on a different host or port:

```yaml
providers:
  - id: litellm:gpt-4.1
    config:
      apiBaseUrl: https://your-litellm-server.com
```

### Using Config File

For more complex setups, use the config file:

```bash
litellm --config litellm_config.yaml
```

## Learn More

- [LiteLLM Documentation](https://docs.litellm.ai/docs/)
- [Promptfoo LiteLLM Provider Docs](/docs/providers/litellm)
- [LiteLLM Proxy Setup](https://docs.litellm.ai/docs/proxy/quick_start)
