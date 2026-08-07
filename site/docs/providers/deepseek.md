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
- `showThinking` - Control whether returned reasoning content is included in promptfoo's output (default: `true`); this does not select the API's thinking mode
- `passthrough.thinking` - Select the API mode with `{ type: enabled }` or `{ type: disabled }`

## Available Models

:::note

The current API model names are `deepseek-v4-flash` and `deepseek-v4-pro`. DeepSeek retired the legacy `deepseek-chat` and `deepseek-reasoner` aliases on July 24, 2026. Promptfoo still recognizes both IDs for backward-compatible configuration, but upstream requests using them are rejected. The bare `deepseek:` provider defaults to `deepseek-v4-flash` and explicitly disables thinking to preserve the old bare-provider behavior. Explicit V4 model IDs use DeepSeek's upstream thinking-enabled default unless you override `passthrough.thinking`.

:::

### deepseek-v4-flash

- General purpose V4 model for conversations and reasoning
- Currently resolves to DeepSeek-V4-Flash-0731; available in public beta
- Supports thinking and non-thinking modes and the Responses API
- 1M context window, up to 384K output tokens
- Input: $0.0028/1M (cache hit), $0.14/1M (cache miss)
- Output: $0.28/1M

### deepseek-v4-pro

- Higher-capability V4 model with thinking and non-thinking modes
- Preview model awaiting its official release; the Responses API is not yet supported
- 1M context window, up to 384K output tokens
- Input: $0.003625/1M (cache hit), $0.435/1M (cache miss)
- Output: $0.87/1M

### Legacy aliases

### deepseek-chat

- Retained by Promptfoo for backward-compatible configuration, but retired upstream
- Use `deepseek-v4-flash` for active configs

### deepseek-reasoner

- Retained by Promptfoo for backward-compatible configuration, but retired upstream
- Use an explicit V4 model with thinking enabled

:::warning

Thinking mode does not support `temperature`, `top_p`, `presence_penalty`, or `frequency_penalty` parameters. Setting these parameters will not trigger an error but will have no effect.

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
  - id: openai:chat:gpt-5.6

prompts:
  - 'Solve this step by step: {{math_problem}}'

tests:
  - vars:
      math_problem: 'What is the derivative of x^3 + 2x with respect to x?'
```

### Controlling Reasoning Output

DeepSeek V4 models include detailed reasoning steps in their output when thinking mode is
enabled. You can control whether this reasoning content is shown using the `showThinking`
parameter:

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

See our [complete example](https://github.com/promptfoo/promptfoo/tree/main/examples/compare-deepseek-r1-vs-openai-o1) that benchmarks DeepSeek V4 Pro against OpenAI GPT-5.6 on the MMLU reasoning tasks.

## API Details

- Base URL: `https://api.deepseek.com/v1`
- OpenAI-compatible API format
- Full [API documentation](https://api-docs.deepseek.com/)

## See Also

- [OpenAI Provider](/docs/providers/openai/) - Compatible configuration options
- [Complete example](https://github.com/promptfoo/promptfoo/tree/main/examples/compare-deepseek-r1-vs-openai-o1) - Benchmark DeepSeek V4 Pro against OpenAI GPT-5.6
