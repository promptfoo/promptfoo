---
sidebar_label: Eden AI
description: Configure Eden AI's EU-based, OpenAI-compatible gateway to evaluate models from OpenAI, Anthropic, Google, Mistral, Cohere and more with promptfoo
---

# Eden AI

[Eden AI](https://www.edenai.co/) is an EU-based, OpenAI-compatible LLM gateway. A single API key reaches models from many providers (OpenAI, Anthropic, Google, Mistral, Cohere and more), and it offers EU data residency, zero data retention, a DPA, and SOC 2 / ISO 27001. The Eden AI provider extends the [OpenAI provider](/docs/providers/openai/), so all of its options are supported.

## Setup

1. Get an API key from the [Eden AI dashboard](https://app.edenai.run/admin/account/settings).
2. Set the `EDENAI_API_KEY` environment variable or specify `apiKey` in your config.

```yaml
providers:
  - id: edenai:openai/gpt-4o-mini
```

Both `edenai:<vendor/model>` and `edenai:chat:<vendor/model>` resolve to the chat completions endpoint. If you omit the model, the provider defaults to `openai/gpt-4o-mini`.

## Available Models

Eden AI's catalog rotates over time and models are vendor-prefixed. Call the models API (`GET https://api.edenai.run/v3/models`) for the live set. Common ids include:

- `openai/gpt-4o-mini`, `openai/gpt-4o`, `openai/gpt-4.1`
- `anthropic/claude-sonnet-4-5`, `anthropic/claude-haiku-4-5`
- `google/gemini-2.5-pro`
- `mistral/mistral-large-latest`
- `cohere/command-a-03-2025`

## Configuration

```yaml
providers:
  - id: edenai:openai/gpt-4o-mini
    config:
      temperature: 0.2
      max_tokens: 1024
```

### Configuration Options

The provider accepts every option the [OpenAI provider](/docs/providers/openai/) supports. Commonly used:

- `temperature`, `max_tokens`, `top_p`, `presence_penalty`, `frequency_penalty`
- `stream`
- `response_format` (JSON mode), `tools` / `tool_choice` (function calling)
- `apiBaseUrl` — override the base URL (see EU data residency below)
- `apiKey`, `apiKeyEnvar` — set the key directly or from a custom env var

Any other parameter supported by the OpenAI provider is forwarded as-is.

## EU data residency

Eden AI offers an EU endpoint for data residency. Point the provider at it with `apiBaseUrl`:

```yaml
providers:
  - id: edenai:openai/gpt-4o-mini
    config:
      apiBaseUrl: https://api.eu.edenai.run/v3
```

## Example Usage

```yaml
providers:
  - id: edenai:openai/gpt-4o-mini
  - id: edenai:anthropic/claude-sonnet-4-5

prompts:
  - 'Summarize the following in one sentence: {{text}}'

tests:
  - vars:
      text: 'Promptfoo is an open-source tool for testing and evaluating LLM apps.'
```

A runnable example lives in [examples/provider-edenai](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-edenai).

## API Details

- Base URL: `https://api.edenai.run/v3` (global). EU data residency uses `https://api.eu.edenai.run/v3` — point at it with `apiBaseUrl`.
- OpenAI-compatible chat completions API.
- Full [API documentation](https://www.edenai.co/docs).

## See Also

- [OpenAI Provider](/docs/providers/openai/) — compatible configuration options
- [Eden AI documentation](https://www.edenai.co/docs)
