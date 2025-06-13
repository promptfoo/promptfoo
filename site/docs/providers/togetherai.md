---
sidebar_label: Together AI
---

# Together AI

[Together AI](https://www.together.ai/) provides access to open-source models through an API compatible with OpenAI's interface.

## OpenAI Compatibility

Together AI's API is compatible with OpenAI's API, which means all parameters available in the [OpenAI provider](/docs/providers/openai/) work with Together AI.

## Basic Configuration

Configure a Together AI model in your promptfoo configuration:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: togetherai:meta-llama/Llama-3.3-70B-Instruct-Turbo
    config:
      temperature: 0.7
```

The provider requires an API key stored in the `TOGETHER_API_KEY` environment variable.

## Key Features

### Max Tokens Configuration

```yaml
config:
  max_tokens: 4096
```

### Function Calling

```yaml
config:
  tools:
    - type: function
      function:
        name: get_weather
        description: Get the current weather
        parameters:
          type: object
          properties:
            location:
              type: string
              description: City and state
```

### JSON Mode

```yaml
config:
  response_format: { type: 'json_object' }
```

## Popular Models

Together AI offers over 200 models. Here are some of the most popular models by category:

### Llama 4 Models

- **Llama 4 Maverick**: `meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8` (524,288 context length, FP8)
- **Llama 4 Scout**: `meta-llama/Llama-4-Scout-17B-16E-Instruct` (327,680 context length, FP16)

### DeepSeek Models

- **DeepSeek R1**: `deepseek-ai/DeepSeek-R1` (128,000 context length, FP8)
- **DeepSeek R1 Distill Llama 70B**: `deepseek-ai/DeepSeek-R1-Distill-Llama-70B` (131,072 context length, FP16)
- **DeepSeek R1 Distill Qwen 14B**: `deepseek-ai/DeepSeek-R1-Distill-Qwen-14B` (131,072 context length, FP16)
- **DeepSeek V3**: `deepseek-ai/DeepSeek-V3` (16,384 context length, FP8)

### Llama 3 Models

- **Llama 3.3 70B Instruct Turbo**: `meta-llama/Llama-3.3-70B-Instruct-Turbo` (131,072 context length, FP8)
- **Llama 3.1 70B Instruct Turbo**: `meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo` (131,072 context length, FP8)
- **Llama 3.1 405B Instruct Turbo**: `meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo` (130,815 context length, FP8)
- **Llama 3.1 8B Instruct Turbo**: `meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo` (131,072 context length, FP8)
- **Llama 3.2 3B Instruct Turbo**: `meta-llama/Llama-3.2-3B-Instruct-Turbo` (131,072 context length, FP16)

### Mixtral Models

- **Mixtral-8x7B Instruct**: `mistralai/Mixtral-8x7B-Instruct-v0.1` (32,768 context length, FP16)
- **Mixtral-8x22B Instruct**: `mistralai/Mixtral-8x22B-Instruct-v0.1` (65,536 context length, FP16)
- **Mistral Small 3 Instruct (24B)**: `mistralai/Mistral-Small-24B-Instruct-2501` (32,768 context length, FP16)

### Qwen Models

- **Qwen 2.5 72B Instruct Turbo**: `Qwen/Qwen2.5-72B-Instruct-Turbo` (32,768 context length, FP8)
- **Qwen 2.5 7B Instruct Turbo**: `Qwen/Qwen2.5-7B-Instruct-Turbo` (32,768 context length, FP8)
- **Qwen 2.5 Coder 32B Instruct**: `Qwen/Qwen2.5-Coder-32B-Instruct` (32,768 context length, FP16)
- **QwQ-32B**: `Qwen/QwQ-32B` (32,768 context length, FP16)

### Vision Models

- **Llama 3.2 Vision**: `meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo` (131,072 context length, FP16)
- **Qwen 2.5 Vision Language 72B**: `Qwen/Qwen2.5-VL-72B-Instruct` (32,768 context length, FP8)
- **Qwen 2 VL 72B**: `Qwen/Qwen2-VL-72B-Instruct` (32,768 context length, FP16)

### Free Endpoints

Together AI offers free tiers with reduced rate limits:

- `meta-llama/Llama-3.3-70B-Instruct-Turbo-Free`
- `meta-llama/Llama-Vision-Free`
- `deepseek-ai/DeepSeek-R1-Distill-Llama-70B-Free`

For a complete list of all 200+ available models and their specifications, refer to the [Together AI Models page](https://docs.together.ai/docs/inference-models).

## Example Configuration

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.jsons
providers:
  - id: togetherai:meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8
    config:
      temperature: 0.7
      max_tokens: 4096

  - id: togetherai:deepseek-ai/DeepSeek-R1
    config:
      temperature: 0.0
      response_format: { type: 'json_object' }
      tools:
        - type: function
          function:
            name: get_weather
            description: Get weather information
            parameters:
              type: object
              properties:
                location: { type: 'string' }
                unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
```

For more information, refer to the [Together AI documentation](https://docs.together.ai/docs/chat-models).
