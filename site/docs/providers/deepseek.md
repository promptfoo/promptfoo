---
sidebar_label: DeepSeek
description: Configure DeepSeek's OpenAI-compatible API with V4.1 Flash, thinking controls, 1M context windows, and prompt caching
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
  - id: deepseek:deepseek-flash
    config:
      max_tokens: 4000
      apiKey: YOUR_DEEPSEEK_API_KEY
      passthrough:
        thinking:
          type: disabled

  - id: deepseek:deepseek-flash
    config:
      max_tokens: 8192
      showThinking: true
      passthrough:
        thinking:
          type: enabled
        reasoning_effort: high
```

### Configuration Options

- `temperature`
- `max_tokens`
- `cost`, `inputCost`, `outputCost`, `cacheReadCost` - Set applicable per-token prices. `inputCost` and `outputCost` take precedence over `cost`; cached input uses `cacheReadCost`, falling back to `inputCost` or `cost`.
- `top_p`, `presence_penalty`, `frequency_penalty`
- `stream`
- `showThinking` - Control whether returned reasoning content is included in promptfoo's output (default: `true`); this does not select the API's thinking mode
- `passthrough.thinking` - Select the API mode with `{ type: enabled }` or `{ type: disabled }`

## Available Models

DeepSeek uses [peak and off-peak pricing](https://api-docs.deepseek.com/quick_start/pricing/). Promptfoo leaves cost unknown unless you configure the applicable rates for the tokens used; it does not infer a request's billing period from the current clock.

:::note

The current canonical Flash ID is `deepseek-flash`. The bare `deepseek:` provider defaults to it and explicitly disables thinking to preserve the old bare-provider behavior. Explicit model IDs use DeepSeek's upstream thinking-enabled default unless you override `passthrough.thinking`.

DeepSeek [retired the legacy `deepseek-chat` and `deepseek-reasoner` aliases](https://api-docs.deepseek.com/news/news260424/#api-is-available-today) on July 24, 2026. Promptfoo still recognizes both IDs for backward-compatible configuration, but upstream requests using them are rejected.

:::

### deepseek-flash

- Serves DeepSeek-V4.1-Flash, [released September 10, 2026](https://api-docs.deepseek.com/updates/#date-2026-09-10), with native vision support
- Supports thinking and non-thinking modes and the Responses API
- 1M context window, up to 384K output tokens

### deepseek-v4-flash

`deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` are [temporary compatibility aliases](https://api-docs.deepseek.com/) that serve V4.1 Flash and use Flash billing. Their original models are retired. Use `deepseek-flash` for new configs; no alias expiry date is announced.

### deepseek-v4-pro

- Higher-capability V4 model with thinking and non-thinking modes
- As of September 11, 2026, serves V4-Pro-0813, released August 13. DeepSeek's native [Responses API](https://api-docs.deepseek.com/guides/responses_api/) supports this model. The `deepseek:` provider uses Chat Completions.
- DeepSeek [schedules this ID to route to V4.1 Flash](https://api-docs.deepseek.com/updates/#date-2026-09-10) from September 14, 2026 at 04:00 UTC, with Flash billing, until a future V4.1 Pro release. No release date is announced.
- 1M context window, up to 384K output tokens

### Legacy aliases

### deepseek-chat

- Retained by Promptfoo for backward-compatible configuration, but retired upstream
- Use `deepseek-flash` for active configs

### deepseek-reasoner

- Retained by Promptfoo for backward-compatible configuration, but retired upstream
- Use `deepseek-flash` with thinking enabled

:::warning

In [thinking mode](https://api-docs.deepseek.com/guides/thinking_mode/), `top_p` applies, but values below `0.95` are raised to `0.95`; `temperature` has no effect. Non-thinking mode fixes `top_p` at `1.0` and ignores supplied values. The [Chat API](https://api-docs.deepseek.com/api/create-chat-completion/) ignores `presence_penalty` and `frequency_penalty` in both modes.

:::

## Example Usage

Here's an example comparing DeepSeek with OpenAI on reasoning tasks:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: deepseek:deepseek-flash
    config:
      max_tokens: 8192
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

DeepSeek models include detailed reasoning steps in their output when thinking mode is
enabled. You can control whether this reasoning content is shown using the `showThinking`
parameter:

```yaml
providers:
  - id: deepseek:deepseek-flash
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

See our [complete example](https://github.com/promptfoo/promptfoo/tree/main/examples/compare-deepseek-r1-vs-openai-o1) that benchmarks DeepSeek V4.1 Flash against OpenAI GPT-5.6 on the MMLU reasoning tasks.

## API Details

- Base URL: `https://api.deepseek.com/v1`
- OpenAI-compatible API format
- Full [API documentation](https://api-docs.deepseek.com/)

## See Also

- [OpenAI Provider](/docs/providers/openai/) - Compatible configuration options
- [Complete example](https://github.com/promptfoo/promptfoo/tree/main/examples/compare-deepseek-r1-vs-openai-o1) - Benchmark DeepSeek V4.1 Flash against OpenAI GPT-5.6
