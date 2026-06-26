---
description: Route promptfoo requests through a self-hosted Helicone AI Gateway
---

# Helicone AI Gateway

[Helicone AI Gateway](https://github.com/Helicone/ai-gateway) is an open-source, self-hosted
OpenAI-compatible gateway. The Helicone provider in promptfoo routes requests through a locally
running gateway instance.

## Benefits

- **Unified Interface**: Use OpenAI-compatible requests with gateway-supported providers
- **Load Balancing**: Route requests using gateway-defined strategies
- **Caching**: Cache responses when a cache store and layer are configured
- **Rate Limiting**: Apply limits configured on the gateway
- **Observability**: Optional integration with Helicone's observability platform
- **Self-Hosted**: Run your own gateway instance for full control

## Setup

### Start Helicone AI Gateway

First, start a local Helicone AI Gateway instance:

```bash
# Set your provider API keys
export OPENAI_API_KEY=your_openai_key
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
  - id: helicone:openai/gpt-4o-mini
    config:
      router: development
```

## Configuration Options

### Provider Format

The Helicone provider uses the format: `helicone:provider/model`

Examples:

- `helicone:openai/gpt-4o`
- `helicone:groq/llama-3.1-8b-instant`

### Supported Models

The self-hosted gateway validates model IDs against its bundled catalog before forwarding requests.
Check both the [Helicone AI Gateway documentation](https://github.com/Helicone/ai-gateway) and the
upstream provider's current catalog before pinning an ID.

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

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
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

Configure observability on the gateway, then use a normal promptfoo config to compare its upstream
providers:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - helicone:openai/gpt-4o-mini
  - helicone:groq/llama-3.1-8b-instant

prompts:
  - 'Write a creative story about {{topic}}'

tests:
  - vars:
      topic: 'a robot learning to paint'
```

### Custom Provider with Full Configuration

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
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

Configure a cache store and cache layer on the gateway first. The request header below opts this
provider into that existing cache layer; it does not create a cache store.

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: helicone:openai/gpt-4o-mini
    config:
      headers:
        Helicone-Cache-Enabled: 'true'

prompts:
  - 'Summarize: {{text}}'

tests:
  - vars:
      text: 'Large text content to summarize...'
```

## Features

### Request Monitoring

Request logging depends on the gateway's optional Helicone integration. Configure it on the gateway;
the promptfoo provider does not enable logging or add Helicone properties by itself.

### Cost Analytics

Cost analytics also depend on the gateway's optional Helicone integration. They are not enabled by
the promptfoo provider alone.

### Caching

Caching depends on the gateway's cache store and middleware configuration. Request headers can
override an existing cache layer for one provider request.

### Rate Limiting

Rate limits are configured on the gateway, not in the promptfoo provider config.

## Best Practices

1. Check both the gateway catalog and the upstream provider catalog before pinning a model ID.
2. Configure routers, caching, logging, and rate limits on the gateway before using related request options.
3. Keep upstream provider credentials in environment variables instead of tracked promptfoo configs.

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
