---
sidebar_label: Volcengine Ark (Doubao)
description: Configure Volcengine Ark (Doubao) models with OpenAI-compatible API, deep thinking mode, and prompt caching for LLM testing in promptfoo.
---

# Volcengine Ark (Doubao)

[Volcengine Ark](https://www.volcengine.com/product/ark) (火山引擎方舟) provides an OpenAI-compatible API for Doubao (豆包) series foundation models as well as hosted open-source models. The Volcengine provider is compatible with the options provided by the [OpenAI provider](/docs/providers/openai/).

## Setup

1. Get an API key from the [Volcengine Ark Console](https://console.volcengine.com/ark/region:cn-beijing/apiKey).
2. Set the `ARK_API_KEY` environment variable or specify `apiKey` in your config:

```sh
export ARK_API_KEY=your_api_key_here
```

## Configuration

Basic configuration example:

```yaml
providers:
  - id: volcengine:doubao-seed-2-1-pro-260628
    config:
      temperature: 0.7
      max_tokens: 4096
      apiKey: YOUR_ARK_API_KEY

  - id: volcengine:doubao-seed-evolving
    config:
      temperature: 0.7
```

If no model is specified (`volcengine:` or `volcengine`), promptfoo defaults to `doubao-seed-2-1-pro-260628`.

### Configuration Options

- `temperature` - Controls randomness (0.0 to 1.0)
- `max_tokens` / `max_completion_tokens` - Maximum tokens to generate
- `apiKey` - Volcengine Ark API key (overrides `ARK_API_KEY` environment variable)
- `apiBaseUrl` - Custom endpoint URL (defaults to `https://ark.cn-beijing.volces.com/api/v3`)
- `cost`, `inputCost`, `outputCost` - Override promptfoo's pricing estimates
- `top_p`, `presence_penalty`, `frequency_penalty` - Standard sampling parameters
- `passthrough` - Pass Ark-specific parameters such as `thinking` or `reasoning_effort`

### Deep Thinking Configuration

For models supporting deep thinking (reasoning), you can configure thinking behavior via `passthrough`:

```yaml
providers:
  - id: volcengine:doubao-seed-2-1-pro-260628
    config:
      passthrough:
        thinking:
          type: enabled # 'enabled' | 'disabled' | 'auto'
        reasoning_effort: high # 'minimal' | 'low' | 'medium' | 'high'
```

## Available Models

:::note

Model pricing is converted from official CNY rates (元 / 1M tokens) at the exchange rate of 1 USD = 6.737012 CNY (as of August 2026). For models with tiered pricing based on context length, base tier rates are used.

:::

### Doubao Seed Models

- **`doubao-seed-evolving`**
  - Continuous-evolution coding and agent model
  - 1024K context window, up to 256K output tokens
  - Supports deep thinking, multimodal understanding, and tool calling
  - Input: $0.8906/1M (cache miss), $0.1781/1M (cache hit) | Output: $4.453/1M

- **`doubao-seed-2-1-pro-260628`**
  - Flagship model for complex reasoning, text generation, and multimodal tasks
  - 256K context window, up to 256K output tokens
  - Supports deep thinking, structured output (`json_schema`), and tool calling
  - Input: $0.8906/1M (cache miss), $0.1781/1M (cache hit) | Output: $4.453/1M

- **`doubao-seed-2-1-turbo-260628`**
  - High-performance, low-latency flagship model
  - 256K context window, up to 256K output tokens
  - Input: $0.4453/1M (cache miss), $0.0891/1M (cache hit) | Output: $2.226/1M

- **`doubao-seed-2-0-pro-260215`**
  - 256K context window, up to 128K output tokens
  - Input: $0.4750/1M (cache miss), $0.0950/1M (cache hit) | Output: $2.3749/1M

- **`doubao-seed-2-0-lite-260428`**
  - Lightweight, high-throughput model (up to 30,000 RPM)
  - 256K context window, up to 128K output tokens
  - Input: $0.0891/1M (cache miss), $0.0178/1M (cache hit) | Output: $0.5344/1M

- **`doubao-seed-2-0-mini-260428`**
  - Ultra-lightweight model for high-concurrency tasks
  - 256K context window, up to 128K output tokens
  - Input: $0.0297/1M (cache miss), $0.0059/1M (cache hit) | Output: $0.2969/1M

- **`doubao-seed-2-0-code-preview-260215`**
  - Specialized code generation model
  - 256K context window, up to 128K output tokens
  - Input: $0.4750/1M (cache miss), $0.0950/1M (cache hit) | Output: $2.3749/1M

- **`doubao-seed-character-260628`**
  - Role-play and persona-specialized model
  - 128K context window, up to 32K output tokens
  - Input: $0.1187/1M (cache miss), $0.0237/1M (cache hit) | Output: $0.2969/1M

### Hosted Models

- **`glm-5-2-260617`**
  - GLM-5.2 hosted on Volcengine Ark
  - 1024K context window, up to 128K output tokens
  - Input: $1.1875/1M (cache miss), $0.2969/1M (cache hit) | Output: $4.1561/1M

- **`deepseek-v4-pro-ga-260813`**
  - DeepSeek-V4-Pro hosted on Volcengine Ark
  - 1024K context window, up to 384K output tokens
  - Input: $1.3359/1M (cache miss), $0.0445/1M (cache hit) | Output: $4.0077/1M

- **`deepseek-v4-flash-ga-260731`**
  - DeepSeek-V4-Flash hosted on Volcengine Ark
  - 1024K context window, up to 384K output tokens
  - Input: $0.1484/1M (cache miss), $0.0297/1M (cache hit) | Output: $0.2969/1M

## Example Usage

```yaml
providers:
  - id: volcengine:doubao-seed-2-1-pro-260628
    label: 'Doubao 2.1 Pro'
    config:
      temperature: 0.7
  - id: volcengine:doubao-seed-2-1-turbo-260628
    label: 'Doubao 2.1 Turbo'
    config:
      temperature: 0.7

prompts:
  - 'Explain the concept of {{concept}} in simple terms.'

tests:
  - vars:
      concept: 'quantum computing'
    assert:
      - type: icontains
        value: qubit
```

## API Details

- Base URL: `https://ark.cn-beijing.volces.com/api/v3`
- Authentication: Bearer token via `ARK_API_KEY`
- Documentation: [Volcengine Ark Documentation](https://www.volcengine.com/docs/82379/1099455)
