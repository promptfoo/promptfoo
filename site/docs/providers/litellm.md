---
sidebar_label: LiteLLM
---

# LiteLLM

The [LiteLLM](https://docs.litellm.ai/docs/) provides access to hundreds of LLMs.

You can use LiteLLM with promptfoo in two ways:

## Using the dedicated LiteLLM provider

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

## Environment Variables

You can also set the base URL via environment variables:

```sh
# When using the litellm: provider
LITELLM_API_KEY=your-api-key  # Optional
LITELLM_BASE_URL=http://0.0.0.0:4000/

# When using openai: compatibility
OPENAI_BASE_URL=http://0.0.0.0:4000/
```
