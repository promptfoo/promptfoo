---
title: MiniMax Provider
sidebar_label: MiniMax
sidebar_position: 50
description: Configure MiniMax's OpenAI-compatible API with the M3 and M3.1 Flash models, featuring 1M-token context windows, tunable thinking, and prompt caching.
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
      max_completion_tokens: 2048
      apiKey: YOUR_MINIMAX_API_KEY

  - id: minimax:MiniMax-M3.1-Flash
    config:
      reasoning_effort: medium
      max_completion_tokens: 2048
```

### Configuration Options

- `temperature` - Accepted, but M3 and M3.1 Flash ignore it and always sample at `1`
- `max_completion_tokens` - Maximum completion tokens, including thinking tokens. A low limit can end with `finish_reason: length` and empty content. Legacy `max_tokens` config is translated to this field for compatibility. Limits depend on the model; see the [MiniMax API reference](https://platform.minimax.io/docs/api-reference/text-openai-api).
- `reasoning_effort` - Thinking depth for M3.1 Flash: `low`, `medium`, `high`, `xhigh`, or `max` (the vendor default). Other MiniMax models ignore it.
- `apiBaseUrl` - Optional custom MiniMax-compatible proxy endpoint
- `top_p` - Must be within `(0, 1]`; M3 and M3.1 Flash ignore it and use `0.95`
- `tools` and `tool_choice` - Use these for tool calling. MiniMax rejects the deprecated `function_call` parameter.

When MiniMax reports prompt-cache reads, promptfoo calculates cost using the returned cached token count and the model's cache-read rate.

M3 and M3.1 Flash return thinking in `reasoning_content`, which promptfoo prepends to the output as `Thinking: ...`. Set `showThinking: false` to return only the final answer.

## Available Models

### MiniMax-M3 (Default)

- Flagship model with up to a 1M token context window (512K guaranteed minimum) and up to 128K output
- Multimodal: supports text, image, and video input
- Standard tier, up to 512K input tokens: $0.06/1M cached input, $0.30/1M uncached input, and $1.20/1M output
- Standard tier, above 512K input tokens: $0.12/1M cached input, $0.60/1M uncached input, and $2.40/1M output
- Priority admission costs 1.5 times the standard tier; see [pay-as-you-go pricing](https://platform.minimax.io/docs/guides/pricing-paygo)

:::note

M3 is the default. Compare the [current API prices](https://platform.minimax.io/docs/pricing/overview) for your model, context length, and service tier before choosing a model for cost-sensitive workloads. Subscription Token Plans use a separate billing system.

:::

### MiniMax-M3.1-Flash

- Lower-cost model for agentic tasks, coding, computer use, and cybersecurity
- 1,000,000 token context window
- Multimodal: supports text, image, and video input
- Always thinks: `thinking: { type: disabled }` and `reasoning_effort: none` return a 400 error. Lower `reasoning_effort` to reduce thinking tokens and latency.
- Flat pricing: $0.015/1M cached input, $0.15/1M uncached input, and $0.60/1M output
- No priority tier: M3.1 Flash does not support `service_tier`

MiniMax has retired the M2.x models; see the [MiniMax model list](https://platform.minimax.io/docs/faq/models).

## Example Usage

Here's an example comparing MiniMax with OpenAI:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: minimax:MiniMax-M3
    config:
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
