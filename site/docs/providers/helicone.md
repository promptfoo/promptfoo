---
description: Monitor and optimize LLM usage through Helicone's AI gateway with unified access, caching, and comprehensive observability
---

# Helicone AI Gateway

[Helicone AI Gateway](https://github.com/Helicone/ai-gateway) is an open-source, self-hosted AI gateway that provides a unified OpenAI-compatible interface for 100+ LLM providers. The Helicone provider in promptfoo allows you to route requests through a locally running Helicone AI Gateway instance.

## Benefits

- **Unified Interface**: Use OpenAI SDK syntax to access 100+ different LLM providers
- **Load Balancing**: Smart provider selection based on latency, cost, or custom strategies
- **Caching**: Intelligent response caching to reduce costs and improve performance
- **Rate Limiting**: Built-in rate limiting and usage controls
- **Observability**: Optional integration with Helicone's observability platform
- **Self-Hosted**: Run your own gateway instance for full control

## Setup

### Start Helicone AI Gateway

First, start a local Helicone AI Gateway instance:

```bash
# Set your provider API keys
export OPENAI_API_KEY=your_openai_key
export ANTHROPIC_API_KEY=your_anthropic_key
export GROQ_API_KEY=your_groq_key

# Start the gateway
npx @helicone/ai-gateway@latest
```

The gateway will start on `http://localhost:8080` by default.

### Installation

No additional dependencies are required. The Helicone provider is built into promptfoo and works with any running Helicone AI Gateway instance.

## Usage

### Basic Usage

To route requests through your local Helicone AI Gateway:

```yaml
providers:
  - helicone:openai/gpt-4o-mini
  - helicone:anthropic/claude-3-5-sonnet
  - helicone:groq/llama-3.1-8b-instant
```

The model format is `provider/model` as supported by the Helicone AI Gateway.

### Custom Configuration

For more advanced configuration:

```yaml
providers:
  - id: helicone:openai/gpt-4o
    config:
      # Gateway configuration
      baseUrl: http://localhost:8080 # Custom gateway URL
      router: production # Use specific router
      # Standard OpenAI options
      temperature: 0.7
      max_tokens: 1500
      headers:
        Custom-Header: 'custom-value'
```

### Using Custom Router

If your Helicone AI Gateway is configured with custom routers:

```yaml
providers:
  - id: helicone:openai/gpt-4o
    config:
      router: production
  - id: helicone:openai/gpt-3.5-turbo
    config:
      router: development
```

## Configuration Options

### Provider Format

The Helicone provider uses the format: `helicone:provider/model`

Examples:

- `helicone:openai/gpt-4o`
- `helicone:anthropic/claude-3-5-sonnet`
- `helicone:groq/llama-3.1-8b-instant`

### Supported Models

The Helicone AI Gateway supports 100+ models from various providers. Some popular examples:

| Provider  | Example Models                                                    |
| --------- | ----------------------------------------------------------------- |
| OpenAI    | `openai/gpt-4o`, `openai/gpt-4o-mini`, `openai/o1-preview`        |
| Anthropic | `anthropic/claude-3-5-sonnet`, `anthropic/claude-3-haiku`         |
| Groq      | `groq/llama-3.1-8b-instant`, `groq/llama-3.1-70b-versatile`       |
| Meta      | `meta-llama/Llama-3-8b-chat-hf`, `meta-llama/Llama-3-70b-chat-hf` |
| Google    | `google/gemma-7b-it`, `google/gemma-2b-it`                        |

For a complete list, see the [Helicone AI Gateway documentation](https://github.com/Helicone/ai-gateway).

### Configuration Parameters

#### Gateway Options

- `baseUrl` (string): Helicone AI Gateway URL (defaults to `http://localhost:8080`)
- `router` (string): Custom router name (optional, uses `/ai` endpoint if not specified)
- `model` (string): Override the model name from the provider specification
- `apiKey` (string): Custom API key (defaults to `placeholder-api-key`)

#### OpenAI-Compatible Options

Since the provider extends OpenAI's chat completion provider, all standard OpenAI options are supported:

- `temperature`: Controls randomness (0.0 to 1.0)
- `max_tokens`: Maximum number of tokens to generate
- `top_p`: Nucleus sampling parameter
- `frequency_penalty`: Penalizes frequent tokens
- `presence_penalty`: Penalizes new tokens based on presence
- `stop`: Stop sequences
- `headers`: Additional HTTP headers

## Examples

### Basic OpenAI Integration

```yaml
providers:
  - helicone:openai/gpt-4o-mini

prompts:
  - "Translate '{{text}}' to French"

tests:
  - vars:
      text: 'Hello world'
    assert:
      - type: contains
        value: 'Bonjour'
```

### Multi-Provider Comparison with Observability

```yaml
providers:
  - id: helicone:openai/gpt-4o
    config:
      tags: ['openai', 'gpt4']
      properties:
        model_family: 'gpt-4'

  - id: helicone:anthropic/claude-3-5-sonnet-20241022
    config:
      tags: ['anthropic', 'claude']
      properties:
        model_family: 'claude-3'

prompts:
  - 'Write a creative story about {{topic}}'

tests:
  - vars:
      topic: 'a robot learning to paint'
```

### Custom Provider with Full Configuration

```yaml
providers:
  - id: helicone:openai/gpt-4o
    config:
      baseUrl: https://custom-gateway.example.com:8080
      router: production
      apiKey: your_custom_api_key
      temperature: 0.7
      max_tokens: 1000
      headers:
        Authorization: Bearer your_target_provider_api_key
        Custom-Header: custom-value

prompts:
  - 'Answer the following question: {{question}}'

tests:
  - vars:
      question: 'What is artificial intelligence?'
```

### Caching and Performance Optimization

```yaml
providers:
  - id: helicone:openai/gpt-3.5-turbo
    config:
      cache: true
      properties:
        cache_strategy: 'aggressive'
        use_case: 'batch_processing'

prompts:
  - 'Summarize: {{text}}'

tests:
  - vars:
      text: 'Large text content to summarize...'
    assert:
      - type: latency
        threshold: 2000 # Should be faster due to caching
```

## Features

### Request Monitoring

All requests routed through Helicone are automatically logged with:

- Request/response payloads
- Token usage and costs
- Latency metrics
- Custom properties and tags

### Cost Analytics

Track costs across different providers and models:

- Per-request cost breakdown
- Aggregated cost analytics
- Cost optimization recommendations

### Caching

Intelligent response caching:

- Semantic similarity matching
- Configurable cache duration
- Cost reduction through cache hits

### Rate Limiting

Built-in rate limiting:

- Per-user limits
- Per-session limits
- Custom rate limiting rules

## Best Practices

1. **Use Meaningful Tags**: Tag your requests with relevant metadata for better analytics
2. **Track Sessions**: Use session IDs to track conversation flows
3. **Enable Caching**: For repeated or similar requests, enable caching to reduce costs
4. **Monitor Costs**: Regularly review cost analytics in the Helicone dashboard
5. **Custom Properties**: Use custom properties to segment and analyze your usage

## Troubleshooting

### Common Issues

1. **Authentication Failed**: Ensure your `HELICONE_API_KEY` is set correctly
2. **Unknown Provider**: Check that the provider is in the supported list or use a custom `targetUrl`
3. **Request Timeout**: Check your network connection and target provider availability

### Debug Mode

Enable debug logging to see detailed request/response information:

```bash
LOG_LEVEL=debug promptfoo eval
```

## Related Links

- [Helicone Documentation](https://docs.helicone.ai/)
- [Helicone Dashboard](https://helicone.ai/dashboard)
- [Helicone GitHub](https://github.com/Helicone/helicone)
- [promptfoo Provider Guide](/docs/providers/)
