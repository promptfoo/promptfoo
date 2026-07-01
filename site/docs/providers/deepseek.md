---
sidebar_label: DeepSeek
description: Configure DeepSeek's OpenAI-compatible API with V4 chat and reasoning models, 1M context windows, and prompt caching
---

# DeepSeek

[DeepSeek](https://platform.deepseek.com/) provides an OpenAI-compatible API for their language models, with specialized models for both general chat and advanced reasoning tasks. The DeepSeek provider is compatible with all the options provided by the [OpenAI provider](/docs/providers/openai/).

## Setup

1. Get an API key from the [DeepSeek Platform](https://platform.deepseek.com/)
2. Set `DEEPSEEK_API_KEY` environment variable or specify `apiKey` in your config

## Configuration

Basic configuration example:

```yaml
providers:
  - id: deepseek:deepseek-v4-flash
    config:
      temperature: 0.7
      max_tokens: 4000
      apiKey: YOUR_DEEPSEEK_API_KEY
      passthrough:
        thinking:
          type: disabled

  - id: deepseek:deepseek-v4-pro
    config:
      max_tokens: 8000
      showThinking: true
      passthrough:
        thinking:
          type: enabled
        reasoning_effort: high
```

### Configuration Options

- `temperature`
- `max_tokens`
- `cost`, `inputCost`, `outputCost` - Override promptfoo's pricing estimates (`inputCost` and `outputCost` take precedence over `cost`)
- `top_p`, `presence_penalty`, `frequency_penalty`
- `stream`
- `showThinking` - Control whether returned reasoning content is included in the output (default: `true`)
- `passthrough` - Send DeepSeek-specific request fields such as `thinking` and `reasoning_effort`

## Available Models

:::note

The primary API model names are `deepseek-v4-flash` and `deepseek-v4-pro`. The legacy aliases `deepseek-chat` and `deepseek-reasoner` remain available until July 24, 2026 and map to the non-thinking and thinking modes of `deepseek-v4-flash`, respectively.

:::

### deepseek-v4-flash

- General purpose V4 model for conversations and reasoning
- 1M context window, up to 384K output tokens
- Input: $0.0028/1M (cache hit), $0.14/1M (cache miss)
- Output: $0.28/1M

### deepseek-v4-pro

- Higher-capability V4 model with thinking and non-thinking modes
- 1M context window, up to 384K output tokens
- Input: $0.003625/1M (cache hit), $0.435/1M (cache miss)
- Output: $0.87/1M
- Promotional pricing is documented through May 31, 2026

### Legacy aliases

### deepseek-chat

- Legacy alias that maps to non-thinking `deepseek-v4-flash`
- Scheduled for retirement on July 24, 2026

### deepseek-reasoner

- Legacy alias that maps to thinking `deepseek-v4-flash`
- Scheduled for retirement on July 24, 2026
- Supports showing or hiding reasoning content through the `showThinking` parameter

:::warning

Thinking mode does not support `temperature`, `top_p`, `presence_penalty`, `frequency_penalty`, `logprobs`, or `top_logprobs` parameters. Setting these parameters will not trigger an error but will have no effect.

:::

## Example Usage

Here's an example comparing DeepSeek with OpenAI on reasoning tasks:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: deepseek:deepseek-v4-pro
    config:
      max_tokens: 8000
      showThinking: true # Include reasoning content in promptfoo's output (default)
      passthrough:
        thinking:
          type: enabled
        reasoning_effort: high
  - id: openai:o1

prompts:
  - 'Solve this step by step: {{math_problem}}'

tests:
  - vars:
      math_problem: 'What is the derivative of x^3 + 2x with respect to x?'
```

### Controlling Reasoning Output

DeepSeek V4 models support both thinking and non-thinking modes. Pass the API's `thinking`
field through and use `showThinking` to control whether promptfoo includes returned reasoning
content in its output:

```yaml
providers:
  - id: deepseek:deepseek-v4-pro
    config:
      showThinking: false # Hide reasoning content from output
      passthrough:
        thinking:
          type: enabled
```

When `showThinking` is set to `true` (default), the output includes both reasoning and the final answer in a standardized format:

```
Thinking: <reasoning content>

<final answer>
```

When set to `false`, only the final answer is included in the output. This is useful when you want better reasoning quality but don't want to expose the reasoning process to end users or in your assertions.

## API Details

- Base URL: `https://api.deepseek.com/v1`
- OpenAI-compatible API format
- Full [API documentation](https://platform.deepseek.com/docs)

## See Also

- [OpenAI Provider](/docs/providers/openai/) - Compatible configuration options
- [Complete example](https://github.com/promptfoo/promptfoo/tree/main/examples/compare-deepseek-r1-vs-openai-o1) - Benchmark against OpenAI's o1 model
