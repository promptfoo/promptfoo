---
sidebar_label: Cloudflare Workers AI
---

# Cloudflare Workers AI

This provider supports the [models](https://developers.cloudflare.com/workers-ai/models/) provided by Cloudflare Workers AI, a serverless edge inference platform that runs AI models closer to users for low-latency responses.

The provider uses Cloudflare's OpenAI-compatible API endpoints, making it easy to migrate between OpenAI and Cloudflare AI or use them interchangeably.

## Required Configuration

Set your Cloudflare account ID and API key as environment variables:

```sh
export CLOUDFLARE_ACCOUNT_ID=your_account_id_here
export CLOUDFLARE_API_KEY=your_api_key_here
```

The Cloudflare account ID is not secret and can be included in your promptfoo configuration file. The API key is secret, so use environment variables instead of hardcoding it in config files.

```yaml title="promptfooconfig.yaml"
prompts:
  - Tell me a funny joke about {{topic}}

providers:
  - id: cloudflare-ai:chat:@cf/deepseek-ai/deepseek-r1-distill-qwen-32b
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

This provider leverages Cloudflare's OpenAI-compatible endpoints:

- **Chat completions**: `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions`
- **Text completions**: `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/completions`
- **Embeddings**: `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/embeddings`

All standard OpenAI parameters work with Cloudflare AI models: `temperature`, `max_tokens`, `top_p`, `frequency_penalty`, and `presence_penalty`.

## Provider Types

The Cloudflare AI provider supports three different provider types:

### Chat Completion

For conversational AI and instruction-following models:

```yaml
providers:
  - cloudflare-ai:chat:@cf/deepseek-ai/deepseek-r1-distill-qwen-32b
  - cloudflare-ai:chat:@cf/google/gemma-3-12b-it
  - cloudflare-ai:chat:@hf/nousresearch/hermes-2-pro-mistral-7b
```

### Text Completion

For completion-style tasks:

```yaml
providers:
  - cloudflare-ai:completion:@cf/qwen/qwen2.5-coder-32b-instruct
  - cloudflare-ai:completion:@cf/microsoft/phi-2
```

### Embeddings

For generating text embeddings:

```yaml
providers:
  - cloudflare-ai:embedding:@cf/baai/bge-large-en-v1.5
  - cloudflare-ai:embedding:@cf/baai/bge-base-en-v1.5
```

## Current Model Examples

Here are some of the latest models available on Cloudflare Workers AI:

### State-of-the-Art Models

**Reasoning & Problem Solving:**

- `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` - Advanced reasoning model distilled from DeepSeek R1
- `@cf/qwen/qwq-32b` - Medium-sized reasoning model competitive with o1-mini

**Code Generation:**

- `@cf/qwen/qwen2.5-coder-32b-instruct` - Current state-of-the-art open-source code model
- `@hf/thebloke/deepseek-coder-6.7b-instruct-awq` - Efficient coding model

**General Purpose:**

- `@cf/google/gemma-3-12b-it` - Latest Gemma model with 128K context and multilingual support
- `@hf/nousresearch/hermes-2-pro-mistral-7b` - Function calling and JSON mode support

:::tip

Cloudflare is constantly adding new models. See their [official model catalog](https://developers.cloudflare.com/workers-ai/models/) for the complete list of available models.

:::

## Configuration Examples

### Basic Chat Configuration

```yaml title="promptfooconfig.yaml"
providers:
  - id: cloudflare-ai:chat:@cf/deepseek-ai/deepseek-r1-distill-qwen-32b
    config:
      accountId: your_account_id_here
      temperature: 0.7
      max_tokens: 1000
```

### Advanced Configuration with Multiple Models

```yaml title="promptfooconfig.yaml"
providers:
  - id: cloudflare-ai:chat:@cf/google/gemma-3-12b-it
    config:
      accountId: your_account_id_here
      temperature: 0.8
      max_tokens: 500
      top_p: 0.9
      frequency_penalty: 0.1
      presence_penalty: 0.1

  - id: cloudflare-ai:completion:@cf/qwen/qwen2.5-coder-32b-instruct
    config:
      accountId: your_account_id_here
      temperature: 0.2
      max_tokens: 2000
```

### Embedding Configuration

```yaml title="promptfooconfig.yaml"
providers:
  - id: cloudflare-ai:embedding:@cf/baai/bge-large-en-v1.5
    config:
      accountId: your_account_id_here
```

## Custom API Base URL

Override the default API base URL for custom deployments or specific regions:

```yaml
providers:
  - id: cloudflare-ai:chat:@cf/deepseek-ai/deepseek-r1-distill-qwen-32b
    config:
      accountId: your_account_id_here
      apiBaseUrl: https://api.cloudflare.com/client/v4/accounts/your_account_id/ai/v1
```

## See Also

- [Cloudflare Workers AI Models](https://developers.cloudflare.com/workers-ai/models/) - Complete model catalog
- [Cloudflare Workers AI OpenAI Compatibility](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/) - OpenAI-compatible endpoints
- [OpenAI Provider](./openai.md) - For comparison with OpenAI models
- [Getting Started with Promptfoo](../getting-started.md) - Basic setup guide
