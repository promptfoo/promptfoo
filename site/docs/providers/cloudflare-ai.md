---
sidebar_label: Cloudflare Workers AI
description: Configure Cloudflare Workers AI chat and embedding models for evals with account-scoped authentication, exact model IDs, and OpenAI-compatible requests.
---

# Cloudflare Workers AI

This provider connects to Cloudflare Workers AI [text-generation and embedding models](https://developers.cloudflare.com/workers-ai/models/) through its OpenAI-compatible API.

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

Here are some of the latest models available on Cloudflare Workers AI:

### State-of-the-Art Models (2025)

**Latest OpenAI Models:**

- `@cf/openai/gpt-oss-120b` - OpenAI's production, general purpose, high reasoning model
- `@cf/openai/gpt-oss-20b` - OpenAI's lower latency model for specialized use-cases

**Advanced Multimodal Models:**

- `@cf/meta/llama-4-scout-17b-16e-instruct` - Meta's Llama 4 Scout with native multimodal capabilities and mixture-of-experts architecture
- `@cf/meta/llama-3.3-70b-instruct-fp8-fast` - Llama 3.3 70B optimized for speed with fp8 quantization
- `@cf/meta/llama-3.2-11b-vision-instruct` - Optimized for visual recognition and image reasoning

**Enhanced Reasoning & Problem Solving:**

- `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` - Advanced reasoning model distilled from DeepSeek R1
- `@cf/qwen/qwq-32b` - Medium-sized reasoning model competitive with o1-mini

**Code Generation:**

- `@cf/qwen/qwen2.5-coder-32b-instruct` - Current state-of-the-art open-source code model

**Advanced Language Models:**

- `@cf/mistralai/mistral-small-3.1-24b-instruct` - MistralAI's model with enhanced vision understanding and 128K context
- `@cf/google/gemma-3-12b-it` - Latest Gemma model with 128K context and multilingual support
- `@hf/nousresearch/hermes-2-pro-mistral-7b` - Function calling and JSON mode support

**High-Quality Embeddings:**

- `@cf/google/embeddinggemma-300m` - Google's state-of-the-art embedding model trained on 100+ languages

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

```yaml title="promptfooconfig.yaml"
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
