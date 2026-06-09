---
sidebar_label: Moonshot (Kimi)
description: Configure Moonshot AI's OpenAI-compatible API to evaluate Kimi K2 chat and reasoning models with promptfoo
---

# Moonshot (Kimi)

[Moonshot AI](https://platform.moonshot.ai/) provides an OpenAI-compatible API for its Kimi models, including the Kimi K2 chat and thinking models. The Moonshot provider is compatible with all the options provided by the [OpenAI provider](/docs/providers/openai/).

## Setup

1. Get an API key from the [Moonshot Platform](https://platform.moonshot.ai/console/api-keys).
2. Set the `MOONSHOT_API_KEY` environment variable or specify `apiKey` in your config.

## Configuration

```yaml
providers:
  - id: moonshot:kimi-k2-0711-preview
    config:
      temperature: 0.7
      max_tokens: 4000

  - id: moonshot:kimi-k2-thinking
    config:
      max_tokens: 8000
```

Both `moonshot:<model>` and `moonshot:chat:<model>` resolve to the chat completions endpoint.

### Configuration Options

- `temperature`
- `max_tokens`
- `top_p`, `presence_penalty`, `frequency_penalty`
- `stream`
- `cost`, `inputCost`, `outputCost` — override promptfoo's pricing estimates (`inputCost` and `outputCost` take precedence over `cost`)

Any other parameter supported by the OpenAI provider is forwarded as-is.

## Available Models

Moonshot exposes two model families. See the [model list](https://platform.moonshot.ai/docs/pricing/chat) for the current set and pricing.

- **Kimi K2** — `kimi-k2.6`, `kimi-k2.5`, `kimi-k2-0905-preview`, `kimi-k2-0711-preview`, `kimi-k2-turbo-preview`, and the reasoning variants `kimi-k2-thinking` and `kimi-k2-thinking-turbo`.
- **Moonshot v1** — `moonshot-v1-8k`, `moonshot-v1-32k`, `moonshot-v1-128k`, `moonshot-v1-auto`, and the `*-vision-preview` variants.

## Example Usage

```yaml
providers:
  - id: moonshot:kimi-k2-0711-preview
  - id: openai:gpt-4o-mini

prompts:
  - 'Summarize the following in one sentence: {{text}}'

tests:
  - vars:
      text: 'Promptfoo is an open-source tool for testing and evaluating LLM apps.'
```

## API Details

- Base URL: `https://api.moonshot.ai/v1`
- OpenAI-compatible API format
- Full [API documentation](https://platform.moonshot.ai/docs/api/chat)

## See Also

- [OpenAI Provider](/docs/providers/openai/) — compatible configuration options
