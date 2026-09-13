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

Set `TOGETHER_API_KEY`, or configure `apiKey` directly. Use `apiKeyEnvar` to select a different process environment variable. Provider `env` overrides take precedence only for registered keys such as `TOGETHER_API_KEY`; custom names in provider `env` are not retained by config validation.

Connection options such as `apiBaseUrl`, `apiHost`, and `headers` configure the transport. Model parameters are sent to Together AI, and explicit `passthrough` fields override top-level model parameters.

### Embeddings

The `togetherai:embedding:<model>` route sends embedding requests to Together AI's default API. Together AI currently lists no [serverless embedding models](https://docs.together.ai/docs/serverless/models#embedding-models); check the [dedicated model catalog](https://docs.together.ai/docs/dedicated-endpoints/models) for deployment availability.

Dedicated deployments use a separate base URL and an endpoint string as the model. For a dedicated embedding deployment, use `openai:embedding:<your-project-slug/endpoint-name>` with `config.apiBaseUrl: https://api-inference.together.ai/v1` and `config.apiKeyEnvar: TOGETHER_API_KEY`. See Together AI's [dedicated inference request guide](https://docs.together.ai/docs/dedicated-endpoints/requests).

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

<a id="popular-models"></a>
<a id="deepseek-models"></a>
<a id="llama-3-models"></a>
<a id="qwen-models"></a>

## Current Serverless Models

Together AI's serverless catalog changes frequently. These selected current chat model IDs are
useful starting points:

| Model ID                                  | Context (tokens) |
| ----------------------------------------- | ---------------: |
| `moonshotai/Kimi-K3`                      |        1,048,576 |
| `deepseek-ai/DeepSeek-V4-Pro-0813`        |        1,048,576 |
| `deepseek-ai/DeepSeek-V4-Flash-0731`      |        1,048,576 |
| `Qwen/Qwen3.6-Plus`                       |        1,000,000 |
| `thinkingmachines/Inkling`                |          524,288 |
| `zai-org/GLM-5.2`                         |        1,048,575 |
| `MiniMaxAI/MiniMax-M3`                    |          524,288 |
| `Qwen/Qwen3.5-9B`                         |          262,144 |
| `openai/gpt-oss-120b`                     |          131,072 |
| `meta-llama/Llama-3.3-70B-Instruct-Turbo` |          131,072 |

<a id="llama-4-models"></a>
<a id="mixtral-models"></a>
<a id="vision-models"></a>
<a id="free-endpoints"></a>

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
      temperature: 1.0
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

Kimi K3 uses a fixed `temperature` of `1.0`; see Together AI's [sampling parameters](https://docs.together.ai/docs/kimi-k3-quickstart#sampling-parameters).

For more information, refer to the [Together AI documentation](https://docs.together.ai/docs/chat-models).
