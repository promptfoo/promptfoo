---
title: SiliconFlow Provider
sidebar_label: SiliconFlow
description: How to use SiliconFlow models with promptfoo
---

# SiliconFlow Provider

The SiliconFlow provider allows you to test and evaluate various models offered by SiliconFlow, including Qwen, DeepSeek, GLM, and more.

## Setup

1. Sign up for an account at [SiliconFlow](https://cloud.siliconflow.cn/)
2. Create an API key in your [account settings](https://cloud.siliconflow.cn/account/ak)
3. Set your API key as an environment variable:

```bash
export SILICONFLOW_API_KEY=your_api_key_here
```

## Provider Format

The SiliconFlow provider can be configured using the following format:

```yaml
providers:
  - provider: siliconflow:chat:<model>
    # or simply
  - provider: siliconflow:<model>
    config:
      # model parameters here
```

Where `<model>` is the specific model ID, such as `Qwen/Qwen2.5-72B-Instruct`

## Available Models

SiliconFlow offers a variety of chat models:

### Qwen Series
- `Qwen/Qwen3-30B-A3B`
- `Qwen/Qwen3-32B`
- `Qwen/Qwen3-14B`
- `Qwen/Qwen3-8B`
- `Qwen/Qwen3-235B-A22B`
- `Qwen/QwQ-32B`
- `Qwen/Qwen2.5-72B-Instruct`
- `Qwen/Qwen2.5-32B-Instruct`
- `Qwen/Qwen2.5-14B-Instruct`
- `Qwen/Qwen2.5-7B-Instruct`
- `Qwen/Qwen2.5-Coder-32B-Instruct`
- `Qwen/Qwen2.5-Coder-7B-Instruct`
- `Qwen/Qwen2-7B-Instruct`
- `Qwen/Qwen2-1.5B-Instruct`

### DeepSeek Series
- `deepseek-ai/DeepSeek-V2.5`
- `deepseek-ai/DeepSeek-V3`
- `deepseek-ai/DeepSeek-R1`
- `deepseek-ai/DeepSeek-R1-Distill-Qwen-32B`
- `deepseek-ai/DeepSeek-R1-Distill-Qwen-14B`
- `deepseek-ai/DeepSeek-R1-Distill-Qwen-7B`
- `deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B`

### GLM Series
- `THUDM/GLM-Z1-32B-0414`
- `THUDM/GLM-4-32B-0414`
- `THUDM/GLM-Z1-Rumination-32B-0414`
- `THUDM/GLM-4-9B-0414`
- `THUDM/glm-4-9b-chat`

### InternLM Series
- `internlm/internlm2_5-20b-chat`
- `internlm/internlm2_5-7b-chat`

You can find the complete and up-to-date list of models on the [SiliconFlow Model Square](https://cloud.siliconflow.cn/model).

## Configuration Options

SiliconFlow supports most of the same configuration options as OpenAI:

```yaml
providers:
  - id: siliconflow-qwen
    provider: siliconflow:Qwen/Qwen2.5-72B-Instruct
    config:
      temperature: 0.7
      max_tokens: 2000
      top_p: 0.9
      frequency_penalty: 0.5
      top_k: 50
      enable_thinking: true
      thinking_budget: 4096
      # Other supported parameters
```

### Advanced Parameters

SiliconFlow supports several advanced parameters specific to certain model families:

- `enable_thinking`: Switches between thinking and non-thinking modes (default: `true`). This field only applies to Qwen3.
- `thinking_budget`: Maximum number of tokens for chain-of-thought output (default: `4096`). This applies to all Reasoning models.
- `min_p`: Dynamic filtering threshold that adapts based on token probabilities (default: `0.05`). This field only applies to Qwen3.

### Special Features

SiliconFlow supports several advanced features:

#### JSON Mode

For structured output, you can use the JSON mode:

```yaml
providers:
  - provider: siliconflow:Qwen/Qwen2.5-72B-Instruct
    config:
      response_format:
        type: json_object
```

#### Function Calling

SiliconFlow models can use function calling:

```yaml
providers:
  - provider: siliconflow:deepseek-ai/DeepSeek-V2.5
    config:
      tools:
        - type: function
          function:
            name: get_weather
            description: Get current weather
            parameters:
              type: object
              properties:
                location:
                  type: string
                  description: City name
              required: [location]
```

## Example Configuration

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: SiliconFlow chat model example
providers:
  - id: siliconflow-qwen
    provider: siliconflow:Qwen/Qwen2.5-72B-Instruct
    config:
      temperature: 0.7
      max_tokens: 2000

prompts:
  - "请解释什么是大型语言模型? (Please explain what is a large language model?)"
  - "请编写一个Python函数，用于计算斐波那契数列的第n个数。 (Please write a Python function to calculate the nth number in the Fibonacci sequence.)"

tests:
  - vars: {}
```

## Billing

SiliconFlow uses a token-based billing system. The cost is calculated based on:

```
Total Cost = (Input tokens × Input price) + (Output tokens × Output price)
```

Each model has different pricing. Check the [SiliconFlow Model Square](https://cloud.siliconflow.cn/model) for specific pricing details.

## References

- [SiliconFlow Documentation](https://docs.siliconflow.cn/)
- [SiliconFlow API Reference](https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions.md)
- [SiliconFlow Model Square](https://cloud.siliconflow.cn/model) 