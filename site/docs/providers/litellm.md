---
sidebar_label: LiteLLM
---

# LiteLLM

The [LiteLLM](https://docs.litellm.ai/docs/) provides access to hundreds of LLMs through a unified OpenAI-compatible interface.

You can use LiteLLM with promptfoo in two ways:

## Using the dedicated LiteLLM provider

The LiteLLM provider supports chat, completion, and embedding models:

### Chat models (default)

```yaml
providers:
  - id: litellm:<model name>
  # or explicitly:
  - id: litellm:chat:<model name>
```

For example, to use gpt-4.1:

```yaml
- id: litellm:gpt-4.1
# or
- id: litellm:chat:gpt-4.1
```

### Completion models

```yaml
providers:
  - id: litellm:completion:<model name>
```

### Embedding models

```yaml
providers:
  - id: litellm:embedding:<model name>
```

For example, to use text-embedding-3-small:

```yaml
providers:
  - id: litellm:embedding:text-embedding-3-small
```

You can also configure embeddings for similarity assertions:

```yaml
defaultTest:
  options:
    provider:
      embedding:
        id: litellm:embedding:text-embedding-3-small
        config:
          apiBaseUrl: http://0.0.0.0:4000
```

## Configuration

By default, the provider will connect to `http://0.0.0.0:4000`. You can customize the API base URL:

```yaml
providers:
  - id: litellm:gpt-4.1
    config:
      apiBaseUrl: https://your-litellm-server.com
      apiKey: your-api-key # Optional
```

## Environment Variables

You can also set the base URL via environment variables:

```sh
# When using the litellm: provider
LITELLM_API_KEY=your-api-key  # Optional
LITELLM_BASE_URL=http://0.0.0.0:4000/

# When using openai: compatibility
OPENAI_BASE_URL=http://0.0.0.0:4000/
```

## Using OpenAI compatibility mode

The simplest approach is to use the `litellm` provider directly:

```yaml
providers:
  - id: litellm:<model name>
```

For example, to use gpt-4.1:

```yaml
- id: litellm:gpt-4.1
```

Or to use Anthropic's Claude:

```yaml
- id: litellm:claude-3-5-sonnet-20240620
```

By default, the provider will connect to `http://0.0.0.0:4000`. You can customize the API base URL:

```yaml
providers:
  - id: litellm:gpt-4.1
    config:
      apiBaseUrl: https://your-litellm-server.com
      apiKey: your-api-key # Optional
```
