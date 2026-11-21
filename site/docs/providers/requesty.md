---
sidebar_label: Requesty
description: "Access hundreds of models through Requesty's OpenAI-compatible LLM router, with reported per-call cost tracking and EU endpoint support"
---

# Requesty

[Requesty](https://requesty.ai/) is an OpenAI-compatible LLM router that provides a single interface for accessing models from OpenAI, Anthropic, Google, DeepSeek, and others. It follows the OpenAI API format; see our [OpenAI provider documentation](/docs/providers/openai/) for base API details.

## Setup

1. Get your API key from [Requesty](https://app.requesty.ai/api-keys)
2. Set the `REQUESTY_API_KEY` environment variable or specify `apiKey` in your config

## Model naming

Requesty uses the same `provider/model` naming convention as OpenRouter, so provider IDs look like `requesty:<provider>/<model>`:

| Model ID                               | Good for                           |
| -------------------------------------- | ---------------------------------- |
| `requesty:openai/gpt-4o-mini`          | Fast, low-cost general evaluation  |
| `requesty:openai/gpt-4o`               | Higher-quality general evaluation  |
| `requesty:anthropic/claude-sonnet-4-5` | Long-running agentic workflows     |
| `requesty:deepseek/deepseek-chat`      | Cost-efficient reasoning and tools |
| `requesty:google/gemini-2.5-flash`     | Fast multimodal and general chat   |

For the full catalog and current pricing, see the [Requesty router list](https://app.requesty.ai/router/list).

## Basic Configuration

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: requesty:openai/gpt-4o-mini
    config:
      temperature: 0.7
      max_tokens: 1000

  - id: requesty:anthropic/claude-sonnet-4-5
    config:
      max_tokens: 2000

  - id: requesty:google/gemini-2.5-flash
    config:
      temperature: 0.7
      max_tokens: 4000
```

If you route Requesty traffic through a proxy or Requesty-compatible gateway, set `apiBaseUrl` in the provider config. Precedence is `config.apiBaseUrl` → the hardcoded Requesty default (`https://router.requesty.ai/v1`); the generic OpenAI `OPENAI_API_BASE_URL` / `OPENAI_BASE_URL` env fallbacks are not consulted for this provider. To use the EU endpoint, set `apiBaseUrl` to `https://router.eu.requesty.ai/v1`.

The same pattern applies to `apiKeyEnvar`: set it to read your API key from a custom environment variable name (default `REQUESTY_API_KEY`).

```yaml title="promptfooconfig.yaml"
providers:
  - id: requesty:openai/gpt-4o-mini
    config:
      apiBaseUrl: https://router.eu.requesty.ai/v1
      apiKeyEnvar: MY_PROXY_KEY # optional: read the Bearer token from $MY_PROXY_KEY
```

## Cost tracking

Requesty returns the actual USD charge for each call in `usage.cost`. The `requesty:` provider reports that value as the result cost, so routed models from any vendor, such as `anthropic/claude-sonnet-4-5` or `google/gemini-2.5-flash`, get a cost even though they are not in promptfoo's OpenAI price table. If you set `cost`, `inputCost`, or `outputCost` in the provider config, those rates are used instead.

## Using the generic OpenAI provider

Because Requesty is OpenAI compatible, the generic OpenAI provider also works:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openai:chat:openai/gpt-4o-mini
    config:
      apiBaseUrl: https://router.requesty.ai/v1
      apiKeyEnvar: REQUESTY_API_KEY
```

The `requesty:` provider is built on the same OpenAI chat implementation. On top of it, it reads `REQUESTY_API_KEY` without falling back to `OPENAI_API_KEY`, ignores the `OPENAI_BASE_URL` style env vars, sends the optional `HTTP-Referer` and `X-Title` attribution headers, and uses Requesty's reported `usage.cost` for cost tracking.

## Data handling

Requesty documents what it stores, how long it keeps logged prompts and responses, and its training policy in its [privacy policy](https://www.requesty.ai/privacy) and [data privacy docs](https://docs.requesty.ai/features/data-privacy). Retention and training policies of the upstream model providers are listed per model in the [Requesty model library](https://app.requesty.ai/model-library).

## Thinking/Reasoning Models

Some models include thinking/reasoning tokens in their responses. You can control whether these are shown using the `showThinking` parameter:

```yaml title="promptfooconfig.yaml"
providers:
  - id: requesty:google/gemini-2.5-flash
    config:
      showThinking: false # Hide thinking content from output (default: true)
```

When `showThinking` is true (default), the output includes thinking content:

```
Thinking: <reasoning process>

<actual response>
```
