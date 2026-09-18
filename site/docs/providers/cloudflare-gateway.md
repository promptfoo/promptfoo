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

The `cloudflare-gateway` provider routes promptfoo evals through Cloudflare AI Gateway using the chat protocols listed below. Cloudflare also offers an OpenAI-compatible account API for supported models.

## Provider Format

```
cloudflare-gateway:{provider}:{model}
```

**Examples:**

- `cloudflare-gateway:openai:gpt-5.2`
- `cloudflare-gateway:anthropic:claude-sonnet-4-5-20250929`
- `cloudflare-gateway:groq:openai/gpt-oss-120b`

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

The `cloudflare-gateway` adapter supports these provider-specific chat routes:

| Provider     | Gateway Name    | API Key Environment Variable |
| ------------ | --------------- | ---------------------------- |
| OpenAI       | `openai`        | `OPENAI_API_KEY`             |
| Anthropic    | `anthropic`     | `ANTHROPIC_API_KEY`          |
| Groq         | `groq`          | `GROQ_API_KEY`               |
| Perplexity   | `perplexity-ai` | `PERPLEXITY_API_KEY`         |
| Mistral      | `mistral`       | `MISTRAL_API_KEY`            |
| Azure OpenAI | `azure-openai`  | `AZURE_OPENAI_API_KEY`       |
| Grok (xAI)   | `grok`          | `XAI_API_KEY`                |

:::note
`cloudflare-gateway:` routes for Workers AI, Google AI Studio, Cohere, Hugging Face, and Replicate are rejected with an error, because their native endpoints do not accept OpenAI Chat Completions requests. Use Cloudflare's [OpenAI-compatible REST API](https://developers.cloudflare.com/ai-gateway/usage/rest-api/) for models it supports, as shown below for Workers AI. Other native endpoints require a [custom provider](/docs/providers/custom-api).

AWS Bedrock request signing is not implemented by the `cloudflare-gateway` adapter.
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

Use the generic OpenAI provider with Cloudflare's [OpenAI-compatible Workers AI endpoint](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/) and a supported chat model such as [Llama 3.3 70B](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/). Keep the Workers AI model ID in the request body and select the gateway with `cf-aig-gateway-id`:

```yaml
providers:
  - id: openai:chat:@cf/meta/llama-3.3-70b-instruct-fp8-fast
    config:
      apiBaseUrl: https://api.cloudflare.com/client/v4/accounts/{{env.CLOUDFLARE_ACCOUNT_ID}}/ai/v1
      apiKeyEnvar: CLOUDFLARE_API_TOKEN
      headers:
        cf-aig-gateway-id: '{{env.CLOUDFLARE_GATEWAY_ID}}'
```

This account API uses a Cloudflare API token with **Account → Workers AI → Read** permission as the bearer credential; a gateway-only token is insufficient. Set `CLOUDFLARE_API_TOKEN` to that token. The `cfAigToken` option above belongs to the provider-specific gateway routes and is not used in this configuration. See [Cloudflare REST authentication](https://developers.cloudflare.com/ai-gateway/usage/rest-api/#authentication).

For third-party models on the same account API, choose a supported model from Cloudflare's provider documentation: [Google AI Studio](https://developers.cloudflare.com/ai-gateway/usage/providers/google-ai-studio/) uses `openai:chat:google-ai-studio/<model>`, and [Cohere](https://developers.cloudflare.com/ai-gateway/usage/providers/cohere/) uses `openai:chat:cohere/<model>`. Cloudflare uses the stored BYOK key under the `default` alias when present and otherwise uses Unified Billing; this route does not send your upstream API key. Review [credential precedence](https://developers.cloudflare.com/ai-gateway/features/unified-billing/#credential-precedence) before switching an existing gateway configuration. The older gateway `/compat` endpoint is [deprecated for single-model calls](https://developers.cloudflare.com/ai-gateway/usage/chat-completion/) and has different authentication options.

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

  - id: cloudflare-gateway:groq:openai/gpt-oss-120b
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
