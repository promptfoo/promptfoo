---
sidebar_label: Together AI
description: "Deploy open-source models at scale using Together AI's optimized inference platform with serverless GPU infrastructure"
---

# Together AI

[Together AI](https://www.together.ai/) provides access to open-source models through an API compatible with OpenAI's interface.

## OpenAI Compatibility

Together AI's API is compatible with OpenAI's API, which means all parameters available in the [OpenAI provider](/docs/providers/openai/) work with Together AI.

## Basic Configuration

Configure a Together AI model in your promptfoo configuration:

```yaml
providers:
  - id: togetherai:deepseek-ai/DeepSeek-V4-Flash-0731
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

## Current Serverless Models

Together AI's serverless catalog changes frequently. These selected current chat model IDs are
useful starting points:

| Model ID                                  | Context (tokens) |
| ----------------------------------------- | ---------------: |
| `moonshotai/Kimi-K3`                      |        1,000,000 |
| `deepseek-ai/DeepSeek-V4-Pro`             |          512,000 |
| `deepseek-ai/DeepSeek-V4-Flash-0731`      |        1,000,000 |
| `Qwen/Qwen3.6-Plus`                       |        1,000,000 |
| `thinkingmachines/Inkling`                |          524,288 |
| `moonshotai/Kimi-K2.7-Code`               |          262,144 |
| `zai-org/GLM-5.2`                         |          262,144 |
| `MiniMaxAI/MiniMax-M3`                    |          524,288 |
| `Qwen/Qwen3.5-9B`                         |          262,144 |
| `openai/gpt-oss-120b`                     |          128,000 |
| `meta-llama/Llama-3.3-70B-Instruct-Turbo` |          131,072 |

Check Together AI's [recommended models](https://docs.together.ai/docs/inference/recommended-models),
[live serverless catalog](https://docs.together.ai/docs/serverless/models), and
[deprecation history](https://docs.together.ai/docs/deprecations) before pinning a model in a
long-lived configuration.

## Example Configuration

```yaml
providers:
  - id: togetherai:deepseek-ai/DeepSeek-V4-Flash-0731
    config:
      temperature: 0.7
      max_tokens: 4096

  - id: togetherai:moonshotai/Kimi-K3
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
