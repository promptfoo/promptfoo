---
sidebar_label: Cloudflare Workers AI
description: Configure Cloudflare Workers AI chat and embedding models for evals with account-scoped authentication, exact model IDs, and OpenAI-compatible requests.
---

# Cloudflare Workers AI

This provider connects to Cloudflare Workers AI [text-generation and embedding models](https://developers.cloudflare.com/workers-ai/models/) through its OpenAI-compatible API.

The provider uses Cloudflare's OpenAI-compatible API endpoints, so you can migrate between OpenAI and Cloudflare AI or use them interchangeably.

## Required Configuration

Set your Cloudflare account ID and API key as environment variables:

```sh
export CLOUDFLARE_ACCOUNT_ID=your_account_id_here
export CLOUDFLARE_API_KEY=your_api_key_here
```

The Cloudflare account ID is not secret and can be included in your promptfoo configuration file. The API key is secret, so use environment variables instead of hardcoding it in config files.

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - Tell me a funny joke about {{topic}}

providers:
  - id: cloudflare-ai:chat:@cf/openai/gpt-oss-120b
    config:
      accountId: your_account_id_here
      # API key is loaded from CLOUDFLARE_API_KEY environment variable

tests:
  - vars:
      topic: programming
    assert:
      - type: icontains
        value: '{{topic}}'
```

### Alternative Environment Variable Names

Use custom environment variable names with `apiKeyEnvar` and `accountIdEnvar`:

```yaml
providers:
  - id: cloudflare-ai:chat:@cf/qwen/qwen2.5-coder-32b-instruct
    config:
      accountId: your_account_id_here
      apiKeyEnvar: CUSTOM_CLOUDFLARE_KEY
      accountIdEnvar: CUSTOM_CLOUDFLARE_ACCOUNT
```

## OpenAI Compatibility

Cloudflare documents these [OpenAI-compatible endpoints](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/):

- **Chat completions**: `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions`
- **Embeddings**: `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/embeddings`

Supported parameters and capabilities vary by model. Check the model's Cloudflare documentation before configuring sampling options, tools, or multimodal inputs.

## Provider Types

Use the `chat` or `embedding` provider type for the documented endpoints. The legacy `completion` type is described below.

### Chat Completion

For conversational AI and instruction-following models:

```yaml
providers:
  - cloudflare-ai:chat:@cf/openai/gpt-oss-120b
  - cloudflare-ai:chat:@cf/meta/llama-4-scout-17b-16e-instruct
  - cloudflare-ai:chat:@cf/mistralai/mistral-small-3.1-24b-instruct
```

### Text Completion

The legacy `cloudflare-ai:completion:<model>` selector sends requests to `/ai/v1/completions`. Cloudflare's current compatibility documentation does not establish support for this endpoint. Use a `cloudflare-ai:chat:<model>` selector for new text-generation configurations, including code generation.

[Phi-2](https://developers.cloudflare.com/workers-ai/models/phi-2/) was deprecated on May 30, 2026 and should no longer be used for onboarding.

### Embeddings

For generating text embeddings:

```yaml
providers:
  - cloudflare-ai:embedding:@cf/google/embeddinggemma-300m
  - cloudflare-ai:embedding:@cf/baai/bge-large-en-v1.5
```

## Current Model Examples

Here are some of the models available on Cloudflare Workers AI:

### State-of-the-Art Models (2025)

This legacy heading is retained so existing inbound links keep working. Do not treat a dated
documentation list as Cloudflare's current catalog; verify each exact model ID in the official
catalog before using it.

:::tip

See Cloudflare's [official model catalog](https://developers.cloudflare.com/workers-ai/models/)
for current model IDs and capabilities.

:::

## Configuration Examples

### Basic Chat Configuration

```yaml
providers:
  - id: cloudflare-ai:chat:@cf/deepseek-ai/deepseek-r1-distill-qwen-32b
    config:
      accountId: your_account_id_here
      temperature: 0.7
      max_tokens: 1000
```

### Advanced Configuration with Multiple Models

```yaml
providers:
  - id: cloudflare-ai:chat:@cf/meta/llama-4-scout-17b-16e-instruct
    config:
      accountId: your_account_id_here
      temperature: 0.8
      max_tokens: 500
      top_p: 0.9
      frequency_penalty: 0.1
      presence_penalty: 0.1

  - id: cloudflare-ai:chat:@cf/qwen/qwen2.5-coder-32b-instruct
    config:
      accountId: your_account_id_here
      temperature: 0.2
      max_tokens: 2000
```

### Embedding Configuration

```yaml
providers:
  - id: cloudflare-ai:embedding:@cf/google/embeddinggemma-300m
    config:
      accountId: your_account_id_here
```

## Custom API Base URL

Override the default API base URL for custom deployments or specific regions:

```yaml
providers:
  - id: cloudflare-ai:chat:@cf/openai/gpt-oss-120b
    config:
      accountId: your_account_id_here
      apiBaseUrl: https://api.cloudflare.com/client/v4/accounts/your_account_id/ai/v1
```

## See Also

- [Cloudflare Workers AI Models](https://developers.cloudflare.com/workers-ai/models/) - Complete model catalog
- [Cloudflare Workers AI OpenAI Compatibility](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/) - OpenAI-compatible endpoints
- [OpenAI Provider](./openai.md) - For comparison with OpenAI models
- [Getting Started with Promptfoo](../getting-started.md) - Basic setup guide
