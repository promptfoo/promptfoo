---
sidebar_label: LiteLLM
title: LiteLLM Provider - Access 400+ LLMs with Unified API
description: Use LiteLLM with promptfoo to evaluate 400+ language models through a unified OpenAI-compatible interface. Supports chat, completion, and embedding models.
keywords:
  [
    litellm,
    llm provider,
    openai compatible,
    language models,
    ai evaluation,
    gpt-4,
    claude,
    gemini,
    llama,
    mistral,
    embeddings,
    promptfoo,
  ]
---

# LiteLLM

[LiteLLM](https://docs.litellm.ai/docs/) provides access to 400+ LLMs through a unified OpenAI-compatible interface.

## Usage

You can use LiteLLM with promptfoo in three ways:

### 1. Dedicated LiteLLM provider

The LiteLLM provider supports chat, completion, and embedding models.

#### Chat models (default)

```yaml
providers:
  - id: litellm:<model name>
  # or explicitly:
  - id: litellm:chat:<model name>
```

Example:

```yaml
providers:
  - id: litellm:gpt-4.1-mini
  # or
  - id: litellm:chat:gpt-4.1-mini
```

#### Completion models

```yaml
providers:
  - id: litellm:completion:<model name>
```

#### Embedding models

```yaml
providers:
  - id: litellm:embedding:<model name>
```

Example:

```yaml
providers:
  - id: litellm:embedding:text-embedding-3-large
```

### 2. Using with LiteLLM proxy server

If you're running a LiteLLM proxy server:

```yaml
providers:
  - id: litellm:gpt-4.1-mini
    config:
      apiBaseUrl: http://localhost:4000
      apiKey: ${LITELLM_API_KEY}
```

### 3. Using OpenAI provider with LiteLLM

Since LiteLLM uses the OpenAI format, you can use the OpenAI provider:

```yaml
providers:
  - id: openai:chat:gpt-4.1-mini
    config:
      apiBaseUrl: http://localhost:4000
      apiKey: ${LITELLM_API_KEY}
```

## Configuration

### Basic configuration

```yaml
providers:
  - id: litellm:gpt-4.1-mini
    config:
      apiKey: ${OPENAI_API_KEY}
      temperature: 0.7
      max_tokens: 1000
```

### Advanced configuration

All LiteLLM parameters are supported:

```yaml
providers:
  - id: litellm:claude-4-sonnet
    config:
      apiKey: ${ANTHROPIC_API_KEY}
      temperature: 0.7
      max_tokens: 4096
      top_p: 0.9
      # Any other LiteLLM-supported parameters
```

## Environment Variables

The LiteLLM provider respects standard environment variables:

- `LITELLM_API_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `AZURE_API_KEY`
- Other provider-specific environment variables

## Embedding Configuration

LiteLLM supports embedding models that can be used for similarity metrics and other tasks. You can specify an embedding provider globally or for individual assertions.

### 1. Set a default embedding provider for all tests

```yaml
defaultTest:
  options:
    provider:
      embedding:
        id: litellm:embedding:text-embedding-3-large
```

### 2. Override the embedding provider for a specific assertion

```yaml
assert:
  - type: similar
    value: Reference text
    provider:
      id: litellm:embedding:text-embedding-3-large
```

Additional configuration options can be passed through the `config` block if needed:

```yaml
defaultTest:
  options:
    provider:
      embedding:
        id: litellm:embedding:text-embedding-3-large
        config:
          apiKey: ${OPENAI_API_KEY} # optional if set via environment variable
```

## Complete Example

Here's a complete example using multiple LiteLLM models:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: LiteLLM evaluation example

providers:
  # Chat models
  - id: litellm:gpt-4.1-mini
  - id: litellm:claude-4-sonnet
    config:
      apiKey: ${ANTHROPIC_API_KEY}

  # Embedding model for similarity checks
  - id: litellm:embedding:text-embedding-3-large

prompts:
  - 'Translate this to {{language}}: {{text}}'

tests:
  - vars:
      language: French
      text: 'Hello, world!'
    assert:
      - type: contains
        value: 'Bonjour'
      - type: similar
        value: 'Bonjour, le monde!'
        threshold: 0.8
        provider: litellm:embedding:text-embedding-3-large
```

## Supported Models

LiteLLM supports models from all major providers:

- **OpenAI**: GPT-4.1, GPT-4, GPT-3.5, embeddings, and more
- **Anthropic**: Claude 4, Claude 3.7, Claude 3.5, Claude 3, and earlier models
- **Google**: Gemini and PaLM models
- **Meta**: Llama models
- **Mistral**: All Mistral models
- **And 400+ more models**

For a complete list of supported models, see the [LiteLLM model documentation](https://docs.litellm.ai/docs/providers).

## Supported Parameters

All standard LiteLLM parameters are passed through:

- `temperature`
- `max_tokens`
- `top_p`
- `frequency_penalty`
- `presence_penalty`
- `stop`
- `response_format`
- `tools` / `functions`
- `seed`
- Provider-specific parameters

## Tips

1. **Model naming**: Use exact model names as specified in LiteLLM's documentation
2. **API keys**: Set appropriate API keys for each provider
3. **Proxy server**: Consider running a LiteLLM proxy server for better control
4. **Rate limiting**: LiteLLM handles rate limiting automatically
5. **Cost tracking**: LiteLLM provides built-in cost tracking

## Troubleshooting

If you encounter issues:

1. Verify API keys are correctly set
2. Check model name matches LiteLLM's documentation
3. Ensure LiteLLM proxy server (if using) is accessible
4. Review provider-specific requirements in LiteLLM docs

## See Also

- [LiteLLM Documentation](https://docs.litellm.ai/docs/)
- [Provider Configuration](./index.md)
- [OpenAI Provider](./openai.md)
