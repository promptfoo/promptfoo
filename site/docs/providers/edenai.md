---
sidebar_label: Eden AI
description: Configure Eden AI's EU-based, OpenAI-compatible gateway to evaluate models from OpenAI, Anthropic, Google, Mistral, Cohere and more with promptfoo
---

# Eden AI

[Eden AI](https://www.edenai.co/) is an EU-based, OpenAI-compatible LLM gateway. Use an Eden AI API key to evaluate models available through its non-streaming chat completions endpoint. Consult [Eden AI’s trust center](https://trust.edenai.co/) for current security and compliance information.

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

The provider supports these chat settings, subject to the selected model’s capabilities:

- `temperature`, `max_tokens`, `top_p`, `presence_penalty`, `frequency_penalty`
- `response_format` (JSON mode), `tools` / `tool_choice` (function calling)
- `apiBaseUrl` — override the base URL (see EU data residency below)
- `apiKey`, `apiKeyEnvar` — set the key directly or from a custom env var

The adapter supports non-streaming chat completions. Use the Eden AI API documentation to confirm options for the selected model.

## EU data residency

To use Eden AI’s EU endpoint, set `apiBaseUrl` as shown below. Check your Eden AI agreement for the applicable data handling terms.

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
