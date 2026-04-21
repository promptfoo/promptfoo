---
sidebar_label: OpenRouter
description: "Access 300+ models through OpenRouter's unified API gateway with configurable routing, proxy support, and OpenAI-compatible requests"
---

# OpenRouter

[OpenRouter](https://openrouter.ai/) provides a unified interface for accessing various LLM APIs, including models from OpenAI, Meta, Perplexity, and others. It follows the OpenAI API format - see our [OpenAI provider documentation](/docs/providers/openai/) for base API details.

## Setup

1. Get your API key from [OpenRouter](https://openrouter.ai/)
2. Set the `OPENROUTER_API_KEY` environment variable or specify `apiKey` in your config

## Popular current models

OpenRouter's catalog changes quickly. These are current popular and recent model IDs that work well as starting points. Context lengths are from the OpenRouter catalog at time of writing — check [OpenRouter Models](https://openrouter.ai/models) (or `GET /api/v1/models`) for live values.

| Model ID                                                                                                   | Context (tokens) | Good for                           |
| ---------------------------------------------------------------------------------------------------------- | ---------------: | ---------------------------------- |
| [openai/gpt-5.4](https://openrouter.ai/openai/gpt-5.4)                                                     |        1,050,000 | Highest-quality general evaluation |
| [anthropic/claude-opus-4.7](https://openrouter.ai/anthropic/claude-opus-4.7)                               |        1,000,000 | Long-running agentic workflows     |
| [openai/gpt-5.4-mini](https://openrouter.ai/openai/gpt-5.4-mini)                                           |          400,000 | Fast, lower-cost GPT-5 workflows   |
| [anthropic/claude-haiku-4.5](https://openrouter.ai/anthropic/claude-haiku-4.5)                             |          200,000 | Lower-latency Claude runs          |
| [google/gemini-2.5-pro](https://openrouter.ai/google/gemini-2.5-pro)                                       |        1,048,576 | Reasoning-heavy tasks              |
| [google/gemini-2.5-flash](https://openrouter.ai/google/gemini-2.5-flash)                                   |        1,048,576 | Fast multimodal and general chat   |
| [meta-llama/llama-4-maverick](https://openrouter.ai/meta-llama/llama-4-maverick)                           |        1,048,576 | Popular open-weight frontier model |
| [deepseek/deepseek-v3.2](https://openrouter.ai/deepseek/deepseek-v3.2)                                     |          163,840 | Cost-efficient reasoning and tools |
| [mistralai/mistral-small-3.2-24b-instruct](https://openrouter.ai/mistralai/mistral-small-3.2-24b-instruct) |          128,000 | Compact Mistral general use        |
| [qwen/qwen3-32b](https://openrouter.ai/qwen/qwen3-32b)                                                     |           40,960 | Strong open multilingual model     |

For the full catalog of 300+ models and current pricing, visit [OpenRouter Models](https://openrouter.ai/models).

## Basic Configuration

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: openrouter:openai/gpt-5.4
    config:
      temperature: 0.7
      max_tokens: 1000

  - id: openrouter:anthropic/claude-opus-4.7
    config:
      max_tokens: 2000

  - id: openrouter:google/gemini-2.5-flash
    config:
      temperature: 0.7
      max_tokens: 4000
```

If you route OpenRouter traffic through a proxy or OpenRouter-compatible gateway, set `apiBaseUrl` in the provider config. Precedence is `config.apiBaseUrl` → the hardcoded OpenRouter default (`https://openrouter.ai/api/v1`); the generic OpenAI `OPENAI_API_BASE_URL` / `OPENAI_BASE_URL` env fallbacks are not consulted for this provider.

The same pattern applies to `apiKeyEnvar` — set it to read your API key from a custom environment variable name (default `OPENROUTER_API_KEY`).

```yaml title="promptfooconfig.yaml"
providers:
  - id: openrouter:openai/gpt-5.4
    config:
      apiBaseUrl: https://proxy.example.com/openrouter/api/v1
      apiKeyEnvar: MY_PROXY_KEY # optional: read the Bearer token from $MY_PROXY_KEY
```

## Features

- Access to 300+ models through a single API
- Mix free and paid models in your evaluations
- Support for text and multimodal (vision) models
- Compatible with OpenAI API format
- Pay-as-you-go pricing

## Thinking/Reasoning Models

Some models like Gemini 2.5 Pro include thinking tokens in their responses. You can control whether these are shown using the `showThinking` parameter:

```yaml title="promptfooconfig.yaml"
providers:
  - id: openrouter:google/gemini-2.5-pro
    config:
      showThinking: false # Hide thinking content from output (default: true)
```

When `showThinking` is true (default), the output includes thinking content:

```
Thinking: <reasoning process>

<actual response>
```
