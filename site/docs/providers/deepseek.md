---
sidebar_label: DeepSeek
description: Configure DeepSeek chat and reasoning models, thinking mode, and prompt-cache cost estimates in Promptfoo.
---

# DeepSeek

[DeepSeek](https://platform.deepseek.com/) provides an OpenAI-compatible chat API. The provider accepts [OpenAI chat options](/docs/providers/openai/); DeepSeek determines which options each model supports.

## Setup

1. Get an API key from the [DeepSeek Platform](https://platform.deepseek.com/)
2. Set `DEEPSEEK_API_KEY` environment variable or specify `apiKey` in your config

## Configuration

Basic configuration example:

```yaml
providers:
  - id: deepseek:deepseek-flash
    config:
      temperature: 0.7
      max_tokens: 4000
      passthrough:
        thinking: { type: disabled }

  - id: deepseek:deepseek-v4-pro
    config:
      max_tokens: 8000
```

### Configuration Options

- `temperature`
- `max_tokens`
- `cost`, `inputCost`, `outputCost`, `cacheReadCost` - Set cost estimates in USD per token. `inputCost` and `outputCost` take precedence over `cost`; `cacheReadCost` sets a separate cached-input rate.
- `top_p`, `presence_penalty`, `frequency_penalty`
- `showThinking` - Control whether reasoning content is included in the output (default: `true`, applies to thinking-capable models)

Promptfoo requests complete responses; this provider does not support streaming.

## Available Models

DeepSeek lists `deepseek-flash` and `deepseek-v4-pro` in its [model catalog](https://api-docs.deepseek.com/quick_start/pricing/). The older `deepseek-chat` and `deepseek-reasoner` IDs are retired. The shorthand `deepseek:` uses `deepseek-flash` with thinking disabled; use the full ID for DeepSeek's default thinking mode.

<span id="deepseek-v4-flash" />

### deepseek-flash

Use `deepseek:deepseek-flash` for V4.1 Flash, which supports text and image inputs. The older `deepseek-v4-flash` ID temporarily routes to the same model. It supports a 1M-token context window and up to 384K output tokens.

### deepseek-v4-pro

V4 Pro supports text input, thinking and non-thinking modes, a 1M-token context window, and up to 384K output tokens.

DeepSeek charges different peak and off-peak rates. Promptfoo has no built-in estimate for `deepseek-flash`, and its stored rates for older IDs do not track that schedule. Set `inputCost`, `outputCost`, and optionally `cacheReadCost` for an estimate using the [current rates](https://api-docs.deepseek.com/quick_start/pricing/). If a response uses tokens for which no rate is known, Promptfoo leaves the estimate unset.

:::warning

Thinking mode does not support `temperature`, `top_p`, `presence_penalty`, `frequency_penalty`, `logprobs`, or `top_logprobs` parameters. Setting these parameters will not trigger an error but will have no effect.

:::

## Example Usage

Compare DeepSeek with OpenAI on a reasoning task:

```yaml
providers:
  - id: deepseek:deepseek-v4-pro
    config:
      max_tokens: 8000
      showThinking: true # Include reasoning content in output (default)
  - id: openai:gpt-5.4-mini
    config:
      reasoning_effort: medium

prompts:
  - 'Solve this step by step: {{math_problem}}'

tests:
  - vars:
      math_problem: 'What is the derivative of x^3 + 2x with respect to x?'
```

### Controlling Reasoning Output

Set `showThinking: false` to exclude reasoning content from the output:

```yaml
providers:
  - id: deepseek:deepseek-v4-pro
    config:
      showThinking: false # Hide reasoning content from output
```

With `showThinking: true` (the default), the output includes reasoning when DeepSeek returns it:

```
Thinking: <reasoning content>

<final answer>
```

With `showThinking: false`, assertions see only the final answer. This option does not turn off thinking at the API; use `config.passthrough.thinking: { type: disabled }` for that.

## API Details

- Base URL: `https://api.deepseek.com/v1`
- OpenAI-compatible API format
- [DeepSeek API documentation](https://api-docs.deepseek.com/)

## See Also

- [OpenAI Provider](/docs/providers/openai/) - Compatible configuration options
- [Historical MMLU comparison](https://github.com/promptfoo/promptfoo/tree/main/examples/compare-deepseek-r1-vs-openai-o1) - Replace its retired provider IDs with the current IDs shown above before running it.
