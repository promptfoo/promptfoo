---
title: MiniMax Provider
sidebar_label: MiniMax
sidebar_position: 50
description: Configure MiniMax's OpenAI-compatible API with high-performance M2.7 and M2.5 models featuring 204K context windows and prompt caching for LLM testing.
---

# MiniMax

[MiniMax](https://platform.minimax.io/) provides an OpenAI-compatible API for their language models. The MiniMax provider is compatible with all the options provided by the [OpenAI provider](/docs/providers/openai/).

## Setup

1. Get an API key from the [MiniMax Platform](https://platform.minimax.io/)
2. Set `MINIMAX_API_KEY` environment variable or specify `apiKey` in your config

## Configuration

Basic configuration example:

```yaml
providers:
  - id: minimax:MiniMax-M2.7
    config:
      temperature: 0.7
      max_tokens: 4000
      apiKey: YOUR_MINIMAX_API_KEY

  - id: minimax:MiniMax-M2.7-highspeed
    config:
      max_tokens: 4000
```

### Configuration Options

- `temperature` - Range `(0.0, 1.0]`, cannot be 0
- `max_tokens`
- `top_p`
- `stream`

## Available Models

### MiniMax-M2.7 (Default)

- Latest flagship model with enhanced reasoning and coding
- 204,800 token context window, up to 192K output tokens
- Input: $0.03/1M (cache hit), $0.3/1M (cache miss)
- Output: $1.2/1M

### MiniMax-M2.7-highspeed

- High-speed version of M2.7 for low-latency scenarios
- 204,800 token context window, up to 192K output tokens
- Input: $0.06/1M (cache hit), $0.6/1M (cache miss)
- Output: $2.4/1M

### MiniMax-M2.5

- Peak performance model with ultimate value
- 204,800 token context window, up to 192K output tokens
- Input: $0.03/1M (cache hit), $0.3/1M (cache miss)
- Output: $1.2/1M

### MiniMax-M2.5-highspeed

- Same performance, faster and more agile
- 204,800 token context window, up to 192K output tokens
- Input: $0.03/1M (cache hit), $0.6/1M (cache miss)
- Output: $2.4/1M

## Example Usage

Here's an example comparing MiniMax with OpenAI:

```yaml
providers:
  - id: minimax:MiniMax-M2.7
    config:
      temperature: 0.7
      max_tokens: 4000
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
