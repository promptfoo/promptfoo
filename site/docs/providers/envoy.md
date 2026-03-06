---
sidebar_label: Envoy AI Gateway
description: "Connect to AI models through Envoy AI Gateway's OpenAI-compatible proxy with unified API management and routing capabilities"
---

# Envoy AI Gateway

[Envoy AI Gateway](https://aigateway.envoyproxy.io/) is an open-source AI gateway that provides a unified proxy layer for accessing various AI model providers. It offers [OpenAI-compatible](/docs/providers/openai/) endpoints.

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
```

### With Environment Variable

Set your gateway URL as an environment variable:

```bash
export ENVOY_API_BASE_URL="https://your-envoy-gateway.com"
```

Then use the provider without specifying the URL:

```yaml
providers:
  - id: envoy:my-model
```

### Authenticating via header

Envoy authentication is usually done with an `x-api-key` header. Here's an example of how to configure that:

```yaml
providers:
  - id: envoy:my-model
    config:
      apiBaseUrl: 'https://your-envoy-gateway.com/v1'
      headers:
        x-api-key: 'foobar'
```

## See Also

- [OpenAI Provider](/docs/providers/openai) - Compatible API format used by Envoy AI Gateway
- [Configuration Reference](/docs/configuration/reference.md) - Full configuration options for providers
- [Envoy AI Gateway Documentation](https://aigateway.envoyproxy.io/docs/) - Official gateway documentation
- [Envoy AI Gateway GitHub](https://github.com/envoyproxy/ai-gateway) - Source code and examples
