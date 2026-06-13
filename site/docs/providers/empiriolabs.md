---
sidebar_label: EmpirioLabs
description: Configure EmpirioLabs AI's OpenAI-compatible API to evaluate frontier chat and embedding models, including Qwen3, DeepSeek V4, GLM, Kimi, and MiniMax, through a single endpoint
---

# EmpirioLabs

[EmpirioLabs](https://empiriolabs.ai) provides an OpenAI-compatible API that serves frontier chat and embedding models from many model families through a single endpoint. The EmpirioLabs provider is compatible with all the options provided by the [OpenAI provider](/docs/providers/openai/).

## Setup

1. Create an API key from the [EmpirioLabs dashboard](https://platform.empiriolabs.ai/dashboard/api-keys)
2. Set the `EMPIRIOLABS_API_KEY` environment variable or specify `apiKey` in your config

```sh
export EMPIRIOLABS_API_KEY=your_api_key
```

## Configuration

Basic configuration example:

```yaml
providers:
  - id: empiriolabs:qwen3-7-plus
    config:
      temperature: 0.7
      max_tokens: 4000
      apiKey: YOUR_EMPIRIOLABS_API_KEY

  - id: empiriolabs:deepseek-v4-pro
    config:
      max_tokens: 8000
```

### Configuration Options

- `temperature`
- `max_tokens`
- `cost`, `inputCost`, `outputCost` - Override promptfoo's pricing estimates (`inputCost` and `outputCost` take precedence over `cost`)
- `top_p`, `presence_penalty`, `frequency_penalty`
- `stream`

## Available Models

You can pass any model ID that your EmpirioLabs account has access to. Fetch the live catalog with a `GET` request to `https://api.empiriolabs.ai/v1/models`, or browse the [models documentation](https://docs.empiriolabs.ai). Commonly used IDs include:

### Chat models

- `qwen3-7-plus`
- `qwen3-7-max`
- `deepseek-v4-pro`
- `deepseek-v4-flash`
- `glm-5-1`
- `kimi-k2-7-code`
- `minimax-m3`

### Embedding models

- `text-embedding-v4`

## Example Usage

Compare two EmpirioLabs models on a reasoning task:

```yaml
providers:
  - id: empiriolabs:qwen3-7-max
    config:
      max_tokens: 8000
  - id: empiriolabs:deepseek-v4-pro
    config:
      temperature: 0.0

prompts:
  - 'Solve this step by step: {{math_problem}}'

tests:
  - vars:
      math_problem: 'What is the derivative of x^3 + 2x with respect to x?'
```

## API Details

- Base URL: `https://api.empiriolabs.ai/v1`
- OpenAI-compatible API format with streaming support
- Model catalog endpoint: `GET https://api.empiriolabs.ai/v1/models`
- Full [API documentation](https://docs.empiriolabs.ai)

## See Also

- [OpenAI Provider](/docs/providers/openai/) - Compatible configuration options
- [EmpirioLabs documentation](https://docs.empiriolabs.ai)
