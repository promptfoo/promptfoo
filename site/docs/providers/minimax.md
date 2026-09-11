---
title: MiniMax Provider
sidebar_label: MiniMax
sidebar_position: 50
description: Configure MiniMax's OpenAI-compatible API with the flagship M3 model and prior M2.7 routes, featuring large context windows and prompt caching for LLM testing.
---

# MiniMax

[MiniMax](https://platform.minimax.io/) provides an OpenAI-compatible API for their language models. The MiniMax provider follows the [OpenAI provider](/docs/providers/openai/) chat configuration pattern, with the MiniMax-specific parameter differences described below.

## Setup

1. Get an API key from the [MiniMax Platform](https://platform.minimax.io/)
2. Set `MINIMAX_API_KEY` environment variable or specify `apiKey` in your config

## Configuration

Basic configuration example:

```yaml
providers:
  - id: minimax:MiniMax-M3
    config:
      temperature: 0.7
      max_completion_tokens: 2048
      apiKey: YOUR_MINIMAX_API_KEY

  - id: minimax:MiniMax-M2.7
    config:
      max_completion_tokens: 2048
```

### Configuration Options

- `temperature` - Range `[0, 2]`, with a vendor default of `1` when omitted
- `max_completion_tokens` - Maximum completion tokens. Legacy `max_tokens` config is translated to this field for compatibility. Limits depend on the model; see the [MiniMax API reference](https://platform.minimax.io/docs/api-reference/text-openai-api).
- `apiBaseUrl` - Optional custom MiniMax-compatible proxy endpoint
- `top_p`
- `tools` and `tool_choice` - Use these for tool calling. MiniMax rejects the deprecated `function_call` parameter.

When MiniMax reports prompt-cache reads, promptfoo calculates cost using the returned cached token count and the model's cache-read rate.

## Available Models

### MiniMax-M3 (Default)

- Latest flagship model with up to a 1M token context window (512K guaranteed minimum) and up to 128K output
- Multimodal: supports text, image, and video input
- Standard tier, up to 512K input tokens: $0.06/1M cached input, $0.30/1M uncached input, and $1.20/1M output
- Standard tier, above 512K input tokens: $0.12/1M cached input, $0.60/1M uncached input, and $2.40/1M output
- Priority admission costs 1.5 times the standard tier; see [pay-as-you-go pricing](https://platform.minimax.io/docs/guides/pricing-paygo)

:::note

M3 is the default. Compare the [current API prices](https://platform.minimax.io/docs/pricing/overview) for your model, context length, and service tier before choosing a model for cost-sensitive workloads. Subscription Token Plans use a separate billing system.

:::

### MiniMax-M2.7

- Previous-generation flagship model
- 204,800 token context window
- Input: $0.06/1M (cache hit), $0.3/1M (cache miss)
- Output: $1.2/1M

### MiniMax-M2.7-highspeed

- High-speed version of M2.7 for low-latency scenarios
- 204,800 token context window
- Input: $0.06/1M (cache hit), $0.6/1M (cache miss)
- Output: $2.4/1M

## Example Usage

Here's an example comparing MiniMax with OpenAI:

```yaml
providers:
  - id: minimax:MiniMax-M3
    config:
      temperature: 0.7
      max_completion_tokens: 2048
  - id: openai:gpt-4o
    config:
      temperature: 0.7
      max_tokens: 4000

prompts:
  - 'Answer the following question: {{question}}'

tests:
  - vars:
      question: 'What is the capital of France?'
    assert:
      - type: contains
        value: 'Paris'
```

## API Documentation

- [OpenAI Compatible API](https://platform.minimax.io/docs/api-reference/text-openai-api)
- [Anthropic Compatible API](https://platform.minimax.io/docs/api-reference/text-anthropic-api)
