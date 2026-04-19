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

OpenRouter's catalog changes quickly. These are current popular and recent model IDs that work well as starting points:

| Model ID                                                                                                   | Good for                            |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| [openai/gpt-5.4](https://openrouter.ai/openai/gpt-5.4)                                                     | Highest-quality general evaluation  |
| [openai/gpt-5.4-mini](https://openrouter.ai/openai/gpt-5.4-mini)                                           | Fast, lower-cost GPT-5 workflows    |
| [anthropic/claude-sonnet-4.6](https://openrouter.ai/anthropic/claude-sonnet-4.6)                           | Strong all-around chat and analysis |
| [anthropic/claude-haiku-4.5](https://openrouter.ai/anthropic/claude-haiku-4.5)                             | Lower-latency Claude runs           |
| [google/gemini-2.5-pro](https://openrouter.ai/google/gemini-2.5-pro)                                       | Reasoning-heavy tasks               |
| [google/gemini-2.5-flash](https://openrouter.ai/google/gemini-2.5-flash)                                   | Fast multimodal and general chat    |
| [meta-llama/llama-4-maverick](https://openrouter.ai/meta-llama/llama-4-maverick)                           | Popular open-weight frontier model  |
| [deepseek/deepseek-v3.2](https://openrouter.ai/deepseek/deepseek-v3.2)                                     | Cost-efficient reasoning and tools  |
| [mistralai/mistral-small-3.2-24b-instruct](https://openrouter.ai/mistralai/mistral-small-3.2-24b-instruct) | Compact Mistral general use         |
| [qwen/qwen3-32b](https://openrouter.ai/qwen/qwen3-32b)                                                     | Strong open multilingual model      |

For the full catalog and current pricing, visit [OpenRouter Models](https://openrouter.ai/models).

## Basic Configuration

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: openrouter:anthropic/claude-sonnet-4.6
    config:
      temperature: 0.7
      max_tokens: 1000

  - id: openrouter:openai/gpt-5.4-mini
    config:
      temperature: 0.5
      max_tokens: 2000

  - id: openrouter:google/gemini-2.5-flash
    config:
      temperature: 0.7
      max_tokens: 4000
```

If you route OpenRouter traffic through a proxy or OpenRouter-compatible gateway, set `apiBaseUrl` in the provider config. promptfoo treats this as an override of the default `https://openrouter.ai/api/v1` endpoint.

```yaml title="promptfooconfig.yaml"
providers:
  - id: openrouter:openai/gpt-5.4-mini
    config:
      apiBaseUrl: https://proxy.example.com/openrouter/api/v1
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
