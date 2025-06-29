---
sidebar_label: Cloudflare Workers AI
---

# Cloudflare Workers AI

This provider supports the [models](https://developers.cloudflare.com/workers-ai/models/) provided by Cloudflare Workers AI, a serverless edge embedding and inference runtime.

The provider uses Cloudflare's OpenAI-compatible API endpoints, making it easy to migrate between OpenAI and Cloudflare AI or use them interchangeably.

## Required Configuration

Calling the Workers AI requires the user to supply a Cloudflare account ID and API key with sufficient permissions to invoke the Workers AI REST endpoints.

```sh
export CLOUDFLARE_ACCOUNT_ID=YOUR_ACCOUNT_ID_HERE
export CLOUDFLARE_API_KEY=YOUR_API_KEY_HERE
```

The Cloudflare account ID is not secret and therefore it is safe to put it in your `promptfoo` configuration file. The Cloudflare API key is secret, so while you can provide it in the config, this is **HIGHLY NOT RECOMMENDED** as it might lead to abuse. See below for an example safe configuration:

```yaml
prompts:
  - Tell me a really funny joke about {{topic}}. The joke should contain the word {{topic}}

providers:
  - id: cloudflare-ai:chat:@cf/meta/llama-3-8b-instruct
    config:
      accountId: YOUR_ACCOUNT_ID_HERE
      # It is not recommended to keep your API key on the config file since it is a secret value.
      # Use the CLOUDFLARE_API_KEY environment variable or set the apiKeyEnvar value
      # in the config
      # apiKey: YOUR_API_KEY_HERE
      # apiKeyEnvar: SOME_ENV_HAR_CONTAINING_THE_API_KEY

tests:
  - vars:
      topic: birds
    assert:
      - type: icontains
        value: '{{topic}}'
```

In addition to `apiKeyEnvar` allowed environment variable redirection for the `CLOUDFLARE_API_KEY` value, the `accountIdEnvar` can be used to similarly redirect to a value for the `CLOUDFLARE_ACCOUNT_ID`.

## OpenAI Compatibility

This provider leverages Cloudflare's OpenAI-compatible endpoints:

- **Chat completions**: `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions`
- **Embeddings**: `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/embeddings`

This means you can use standard OpenAI parameters like `temperature`, `max_tokens`, `top_p`, `frequency_penalty`, and `presence_penalty` with Cloudflare AI models.

## Provider Types

The Cloudflare AI provider supports three different provider types:

### Chat Completion
For conversational AI and instruction-following models:
```yaml
providers:
  - cloudflare-ai:chat:@cf/meta/llama-3-8b-instruct
```

### Text Completion
For completion-style tasks:
```yaml
providers:
  - cloudflare-ai:completion:@cf/meta/llama-3-8b-instruct
```

### Embeddings
For generating text embeddings:
```yaml
providers:
  - cloudflare-ai:embedding:@cf/baai/bge-base-en-v1.5
```

## Available Models and Model Parameters

Cloudflare is constantly adding new models to its inventory. See their [official list of models](https://developers.cloudflare.com/workers-ai/models/) for a list of supported models. 

Since the provider uses OpenAI-compatible endpoints, you can use standard OpenAI parameters:

```yaml
providers:
  - id: cloudflare-ai:chat:@cf/meta/llama-3-8b-instruct
    config:
      accountId: YOUR_ACCOUNT_ID_HERE
      temperature: 0.7
      max_tokens: 500
      top_p: 0.9
      frequency_penalty: 0.1
      presence_penalty: 0.1
```

For examples of different configurations:
- Basic usage: `examples/cloudflare-ai/chat_config.yaml`
- Advanced chat configuration: `examples/cloudflare-ai/chat_advanced_configuration.yaml`
- Embedding configuration: `examples/cloudflare-ai/embedding_configuration.yaml`

## Custom API Base URL

You can override the default API base URL if needed:

```yaml
providers:
  - id: cloudflare-ai:chat:@cf/meta/llama-3-8b-instruct
    config:
      accountId: YOUR_ACCOUNT_ID_HERE
      apiBaseUrl: https://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/ai/v1
```

## Future Improvements

- [ ] Allow for the pass through of all generic configuration parameters for Cloudflare REST API
