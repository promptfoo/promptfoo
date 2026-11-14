---
sidebar_label: Envoy AI Gateway
description: "Connect to AI models through Envoy AI Gateway's OpenAI-compatible proxy with unified API management and routing capabilities"
---

# Envoy AI Gateway

[Envoy AI Gateway](https://aigateway.envoyproxy.io/) is an open-source proxy for model providers. Promptfoo uses its [OpenAI-compatible](/docs/providers/openai/) chat endpoint.

## Setup

1. Deploy and configure your Envoy AI Gateway following the [official setup guide](https://aigateway.envoyproxy.io/docs/getting-started/basic-usage)
2. Configure your gateway URL either via environment variable or in your config
3. Set up authentication if required by your gateway configuration

## Provider Format

The Envoy provider uses this format:

- `envoy:<model_name>` - Connects to your gateway using the specified model name

## Configuration

### Basic Configuration

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: envoy:my-model
    config:
      apiBaseUrl: 'https://your-envoy-gateway.com/v1'
      apiKeyEnvar: ENVOY_API_KEY
```

By default, the provider requires a bearer key and reads `OPENAI_API_KEY`. The example uses
`ENVOY_API_KEY` instead. You can also set `apiKey` directly. For a gateway with no bearer key,
set `apiKeyRequired: false`; see [Authenticating via header](#authenticating-via-header).

### With Environment Variable

Set your gateway URL as an environment variable:

```bash
export ENVOY_API_BASE_URL="https://your-envoy-gateway.com"
export ENVOY_API_KEY="your-api-key"
```

Then use the provider without specifying the URL:

```yaml
providers:
  - id: envoy:my-model
    config:
      apiKeyEnvar: ENVOY_API_KEY
```

Set a provider-specific URL in `env`:

```yaml
providers:
  - id: envoy:my-model
    env:
      ENVOY_API_BASE_URL: 'https://your-envoy-gateway.com'
```

Provider environment values override suite and process values. An empty gateway value masks those fallbacks and requires `config.apiBaseUrl`. Omit `config.apiBaseUrl` to use an environment URL; promptfoo adds `/v1` when needed. An empty `config.apiBaseUrl` is invalid. Explicit URLs keep the API path you supply, so include `/v1` or your gateway's custom path.

### Authenticating via header

If your gateway expects an `x-api-key` header, set `apiKeyRequired: false` and supply the header:

```yaml
providers:
  - id: envoy:my-model
    config:
      apiBaseUrl: 'https://your-envoy-gateway.com/v1'
      apiKeyRequired: false
      headers:
        x-api-key: '{{ env.ENVOY_API_KEY }}'
```

## See Also

- [OpenAI Provider](/docs/providers/openai) - Compatible API format used by Envoy AI Gateway
- [Configuration Reference](/docs/configuration/reference.md) - Full configuration options for providers
- [Envoy AI Gateway Documentation](https://aigateway.envoyproxy.io/docs/) - Official gateway documentation
- [Envoy AI Gateway GitHub](https://github.com/envoyproxy/ai-gateway) - Source code and examples
