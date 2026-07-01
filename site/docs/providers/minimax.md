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

- `temperature` - Range `(0.0, 1.0]`, cannot be 0
- `max_completion_tokens` - Maximum completion tokens; the OpenAI-compatible API allows up to `2048`. Legacy `max_tokens` config is translated to this field for compatibility.
- `apiBaseUrl` - Optional custom MiniMax-compatible proxy endpoint
- `top_p`
- `tools` and `tool_choice` - Use these for tool calling. MiniMax rejects the deprecated `function_call` parameter.

When MiniMax reports prompt-cache reads, promptfoo calculates cost using the returned cached token count and the model's cache-read rate.

## Available Models

### MiniMax-M3 (Default)

- Flagship model with up to a 1M token context window (512K guaranteed minimum) and up to 128K output
- Multimodal: supports text, image, and video input
- Input: $0.12/1M (cache hit), $0.6/1M (cache miss)
- Output: $2.4/1M

:::note

M3 is the default and costs roughly 2x M2.7 per token. For cost-sensitive workloads, pin `minimax:MiniMax-M2.7` (or `MiniMax-M2.7-highspeed`) explicitly.

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

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
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
