---
sidebar_label: Cloudflare AI Gateway
sidebar_position: 47
description: Route AI requests through Cloudflare AI Gateway for caching, rate limiting, and analytics.
---

# Cloudflare AI Gateway

[Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/) is a proxy service that routes requests to AI providers through Cloudflare's infrastructure. It provides:

- **Caching** - Reduce costs by caching identical requests
- **Rate limiting** - Control request rates to avoid quota issues
- **Analytics** - Track usage and costs across providers
- **Logging** - Monitor requests and responses
- **Fallback** - Configure fallback providers for reliability

The `cloudflare-gateway` provider lets you route your promptfoo evaluations through Cloudflare AI Gateway to any supported AI provider.

## Provider Format

```
cloudflare-gateway:{provider}:{model}
```

**Examples:**

- `cloudflare-gateway:openai:gpt-5.2`
- `cloudflare-gateway:anthropic:claude-sonnet-4-5-20250929`
- `cloudflare-gateway:groq:llama-3.3-70b-versatile`

## Required Configuration

Set your Cloudflare account ID and gateway ID:

```sh
export CLOUDFLARE_ACCOUNT_ID=your_account_id_here
export CLOUDFLARE_GATEWAY_ID=your_gateway_id_here
```

### Provider API Keys

You need API keys for the providers you're routing through:

```sh
# For OpenAI
export OPENAI_API_KEY=your_openai_key

# For Anthropic
export ANTHROPIC_API_KEY=your_anthropic_key

# For Groq
export GROQ_API_KEY=your_groq_key
```

### Using BYOK (Bring Your Own Keys)

If you've configured [BYOK in Cloudflare](https://developers.cloudflare.com/ai-gateway/configuration/byok/), you can omit provider API keys entirely. Cloudflare will use the keys stored in your gateway configuration.

```yaml
providers:
  # No OPENAI_API_KEY needed - Cloudflare uses stored key
  - id: cloudflare-gateway:openai:gpt-5.2
    config:
      accountId: '{{env.CLOUDFLARE_ACCOUNT_ID}}'
      gatewayId: '{{env.CLOUDFLARE_GATEWAY_ID}}'
      cfAigToken: '{{env.CF_AIG_TOKEN}}'
```

:::note
BYOK works best with OpenAI-compatible providers. Anthropic requires an API key because the SDK mandates it.
:::

### Authenticated Gateways

If your gateway has [Authenticated Gateway](https://developers.cloudflare.com/ai-gateway/configuration/authenticated-gateway/) enabled, you must provide the `cfAigToken`:

```sh
export CF_AIG_TOKEN=your_gateway_token_here
```

## Basic Usage

```yaml title="promptfooconfig.yaml"
prompts:
  - 'Answer this question: {{question}}'

providers:
  - id: cloudflare-gateway:openai:gpt-5.2
    config:
      accountId: '{{env.CLOUDFLARE_ACCOUNT_ID}}'
      gatewayId: '{{env.CLOUDFLARE_GATEWAY_ID}}'
      temperature: 0.7

tests:
  - vars:
      question: What is the capital of France?
```

## Supported Providers

Cloudflare AI Gateway supports routing to these providers:

| Provider         | Gateway Name       | API Key Environment Variable |
| ---------------- | ------------------ | ---------------------------- |
| OpenAI           | `openai`           | `OPENAI_API_KEY`             |
| Anthropic        | `anthropic`        | `ANTHROPIC_API_KEY`          |
| Groq             | `groq`             | `GROQ_API_KEY`               |
| Perplexity       | `perplexity-ai`    | `PERPLEXITY_API_KEY`         |
| Google AI Studio | `google-ai-studio` | `GOOGLE_API_KEY`             |
| Mistral          | `mistral`          | `MISTRAL_API_KEY`            |
| Cohere           | `cohere`           | `COHERE_API_KEY`             |
| Azure OpenAI     | `azure-openai`     | `AZURE_OPENAI_API_KEY`       |
| Workers AI       | `workers-ai`       | `CLOUDFLARE_API_KEY`         |
| Hugging Face     | `huggingface`      | `HUGGINGFACE_API_KEY`        |
| Replicate        | `replicate`        | `REPLICATE_API_KEY`          |
| Grok (xAI)       | `grok`             | `XAI_API_KEY`                |

:::note
AWS Bedrock is not supported through Cloudflare AI Gateway because it requires AWS request signing, which is incompatible with the gateway proxy approach.
:::

## Configuration Options

### Gateway Configuration

| Option            | Type   | Description                                                                   |
| ----------------- | ------ | ----------------------------------------------------------------------------- |
| `accountId`       | string | Cloudflare account ID                                                         |
| `accountIdEnvar`  | string | Custom environment variable for account ID (default: `CLOUDFLARE_ACCOUNT_ID`) |
| `gatewayId`       | string | AI Gateway ID                                                                 |
| `gatewayIdEnvar`  | string | Custom environment variable for gateway ID (default: `CLOUDFLARE_GATEWAY_ID`) |
| `cfAigToken`      | string | Optional gateway authentication token                                         |
| `cfAigTokenEnvar` | string | Custom environment variable for gateway token (default: `CF_AIG_TOKEN`)       |

### Azure OpenAI Configuration

Azure OpenAI requires additional configuration:

| Option           | Type   | Description                                       |
| ---------------- | ------ | ------------------------------------------------- |
| `resourceName`   | string | Azure OpenAI resource name (required)             |
| `deploymentName` | string | Azure OpenAI deployment name (required)           |
| `apiVersion`     | string | Azure API version (default: `2024-12-01-preview`) |

```yaml
providers:
  - id: cloudflare-gateway:azure-openai:gpt-4
    config:
      accountId: '{{env.CLOUDFLARE_ACCOUNT_ID}}'
      gatewayId: '{{env.CLOUDFLARE_GATEWAY_ID}}'
      resourceName: my-azure-resource
      deploymentName: my-gpt4-deployment
      apiVersion: 2024-12-01-preview
```

### Workers AI Configuration

Workers AI routes requests to Cloudflare's edge-deployed models. The model name is included in the URL path:

```yaml
providers:
  - id: cloudflare-gateway:workers-ai:@cf/meta/llama-3.1-8b-instruct
    config:
      accountId: '{{env.CLOUDFLARE_ACCOUNT_ID}}'
      gatewayId: '{{env.CLOUDFLARE_GATEWAY_ID}}'
```

### Provider-Specific Options

All options from the underlying provider are supported. For example, when using `cloudflare-gateway:openai:gpt-5.2`, you can use any [OpenAI provider options](/docs/providers/openai).

```yaml
providers:
  - id: cloudflare-gateway:openai:gpt-5.2
    config:
      accountId: '{{env.CLOUDFLARE_ACCOUNT_ID}}'
      gatewayId: '{{env.CLOUDFLARE_GATEWAY_ID}}'
      temperature: 0.8
      max_tokens: 1000
      top_p: 0.9
```

## Examples

### Multiple Providers

Compare responses from different providers, all routed through your Cloudflare gateway:

```yaml title="promptfooconfig.yaml"
prompts:
  - 'Explain {{topic}} in simple terms.'

providers:
  - id: cloudflare-gateway:openai:gpt-5.2
    config:
      accountId: '{{env.CLOUDFLARE_ACCOUNT_ID}}'
      gatewayId: '{{env.CLOUDFLARE_GATEWAY_ID}}'

  - id: cloudflare-gateway:anthropic:claude-sonnet-4-5-20250929
    config:
      accountId: '{{env.CLOUDFLARE_ACCOUNT_ID}}'
      gatewayId: '{{env.CLOUDFLARE_GATEWAY_ID}}'

  - id: cloudflare-gateway:groq:llama-3.3-70b-versatile
    config:
      accountId: '{{env.CLOUDFLARE_ACCOUNT_ID}}'
      gatewayId: '{{env.CLOUDFLARE_GATEWAY_ID}}'

tests:
  - vars:
      topic: quantum computing
```

### Authenticated Gateway

If your AI Gateway requires authentication:

```yaml
providers:
  - id: cloudflare-gateway:openai:gpt-5.2
    config:
      accountId: '{{env.CLOUDFLARE_ACCOUNT_ID}}'
      gatewayId: '{{env.CLOUDFLARE_GATEWAY_ID}}'
      cfAigToken: '{{env.CF_AIG_TOKEN}}'
```

### Custom Environment Variables

Use custom environment variable names for different projects or environments:

```yaml
providers:
  - id: cloudflare-gateway:openai:gpt-5.2
    config:
      accountIdEnvar: MY_CF_ACCOUNT
      gatewayIdEnvar: MY_CF_GATEWAY
      apiKeyEnvar: MY_OPENAI_KEY
```

## Gateway URL Structure

The provider constructs the gateway URL in this format:

```
https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/{provider}
```

For example, with `accountId: abc123` and `gatewayId: my-gateway`, requests to OpenAI would be routed through:

```
https://gateway.ai.cloudflare.com/v1/abc123/my-gateway/openai
```

## Benefits of Using AI Gateway

### Cost Reduction Through Caching

AI Gateway can cache identical requests, reducing costs when you run the same prompts multiple times (common during development and testing).

### Unified Analytics

View usage across all your AI providers in a single Cloudflare dashboard, making it easier to track costs and usage patterns.

### Rate Limit Protection

AI Gateway can help manage rate limits by queuing requests, preventing your evaluations from failing due to provider rate limits.

### Logging and Debugging

All requests and responses are logged in Cloudflare, making it easier to debug issues and audit AI usage.

## See Also

- [Cloudflare AI Gateway Documentation](https://developers.cloudflare.com/ai-gateway/)
- [Cloudflare Workers AI Provider](/docs/providers/cloudflare-ai) - For running models directly on Cloudflare's edge
- [OpenAI Provider](/docs/providers/openai)
- [Anthropic Provider](/docs/providers/anthropic)
