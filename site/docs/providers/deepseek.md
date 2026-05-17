---
sidebar_label: DeepSeek
description: Configure DeepSeek's OpenAI-compatible API with V4 chat and reasoning models, 1M context windows, and prompt caching for cost-effective LLM testing
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
  - id: deepseek:deepseek-chat
    config:
      temperature: 0.7
      max_tokens: 4000
      apiKey: YOUR_DEEPSEEK_API_KEY

  - id: deepseek:deepseek-reasoner # Legacy alias for V4 Flash thinking mode
    config:
      max_tokens: 8000
```

### Configuration Options

- `temperature`
- `max_tokens`
- `cost`, `inputCost`, `outputCost` - Override promptfoo's pricing estimates (`inputCost` and `outputCost` take precedence over `cost`)
- `top_p`, `presence_penalty`, `frequency_penalty`
- `stream`
- `showThinking` - Control whether reasoning content is included in the output (default: `true`, applies to deepseek-reasoner model)

## Available Models

:::note

The current primary API model names are `deepseek-v4-flash` and `deepseek-v4-pro`. The legacy aliases `deepseek-chat` and `deepseek-reasoner` remain available until July 24, 2026 and currently map to the non-thinking and thinking modes of `deepseek-v4-flash`, respectively.

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

- Legacy alias that currently maps to non-thinking `deepseek-v4-flash`
- Scheduled for retirement on July 24, 2026

### deepseek-reasoner

- Legacy alias that currently maps to thinking `deepseek-v4-flash`
- Scheduled for retirement on July 24, 2026
- Supports showing or hiding reasoning content through the `showThinking` parameter

:::warning

Thinking mode does not support `temperature`, `top_p`, `presence_penalty`, `frequency_penalty`, `logprobs`, or `top_logprobs` parameters. Setting these parameters will not trigger an error but will have no effect.

:::

## Example Usage

Here's an example comparing DeepSeek with OpenAI on reasoning tasks:

```yaml
providers:
  - id: deepseek:deepseek-reasoner
    config:
      max_tokens: 8000
      showThinking: true # Include reasoning content in output (default)
  - id: openai:o-1
    config:
      temperature: 0.0

prompts:
  - 'Solve this step by step: {{math_problem}}'

tests:
  - vars:
      math_problem: 'What is the derivative of x^3 + 2x with respect to x?'
```

### Controlling Reasoning Output

The legacy `deepseek-reasoner` alias uses V4 Flash thinking mode and includes detailed
reasoning steps in its output. You can control whether this reasoning content is shown
using the `showThinking` parameter:

```yaml
providers:
  - id: deepseek:deepseek-reasoner
    config:
      showThinking: false # Hide reasoning content from output
```

When `showThinking` is set to `true` (default), the output includes both reasoning and the final answer in a standardized format:

```
Thinking: <reasoning content>

<final answer>
```

When set to `false`, only the final answer is included in the output. This is useful when you want better reasoning quality but don't want to expose the reasoning process to end users or in your assertions.

See our [complete example](https://github.com/promptfoo/promptfoo/tree/main/examples/compare-deepseek-r1-vs-openai-o1) that benchmarks it against OpenAI's o1 model on the MMLU reasoning tasks.

## API Details

- Base URL: `https://api.deepseek.com/v1`
- OpenAI-compatible API format
- Full [API documentation](https://platform.deepseek.com/docs)

## See Also

- [OpenAI Provider](/docs/providers/openai/) - Compatible configuration options
- [Complete example](https://github.com/promptfoo/promptfoo/tree/main/examples/compare-deepseek-r1-vs-openai-o1) - Benchmark against OpenAI's o1 model
