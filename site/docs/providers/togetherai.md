# Together AI

[Together AI](https://www.together.ai/) provides access to 200+ open-source and specialized models through an API compatible with OpenAI's interface. The service includes models for chat, image generation, vision, code, and embeddings.

## Basic Configuration

The Together AI provider supports all configuration options available in the [OpenAI provider](/docs/providers/openai/). You can configure a Together AI model in your promptfoo configuration like this:

```yaml
providers:
  - id: togetherai:meta-llama/Llama-3.3-70B-Instruct-Turbo
    config:
      temperature: 0.7
```

The provider requires an API key stored in the `TOGETHER_API_KEY` environment variable. Make sure this environment variable is set before running evals.

## Model Types

Together AI offers several types of models that you can specify in the provider ID:

```yaml
providers:
  - id: togetherai:meta-llama/Llama-3.3-70B-Instruct-Turbo
```

## Key Features

### Max Tokens Configuration

To control the maximum length of responses, use the `max_tokens` parameter:

```yaml
config:
  max_tokens: 4096 # Set your desired token limit
```

### Function Calling

To use function calling with supported models:

```yaml
config:
  tools:
    - type: function
      function:
        name: get_weather
        description: Get the current weather in a location
        parameters:
          type: object
          properties:
            location:
              type: string
              description: City and state
```

### JSON Mode

For structured JSON output:

```yaml
config:
  response_format: { type: 'json_object' }
```

## Popular Models

Together AI offers over 200 models. Here are some popular options by category:

### Chat Models

- **Llama 3 Family**

  - `meta-llama/Llama-3.3-70B-Instruct-Turbo` (131K context)
  - `meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo` (131K context)
  - `meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo` (131K context)
  - `meta-llama/Meta-Llama-3-8B-Instruct-Turbo` (8K context)

- **Reasoning Models**
  - `deepseek-ai/DeepSeek-R1` (128K context, strong reasoning)
  - `deepseek-ai/DeepSeek-V3` (16K context, MoE architecture)
- **Mixture of Experts**

  - `mistralai/Mixtral-8x7B-Instruct-v0.1` (32K context)
  - `mistralai/Mixtral-8x22B-Instruct-v0.1` (65K context)

- **Coding Specialists**
  - `Qwen/Qwen2.5-Coder-32B-Instruct` (32K context)

### Vision Models

- `meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo` (11B parameters)
- `meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo` (90B parameters)
- `Qwen/Qwen2-VL-72B-Instruct` (32K context)

### Free Endpoints

Together AI offers free tiers with reduced rate limits:

- `meta-llama/Llama-3.3-70B-Instruct-Turbo-Free` (multilingual chat)
- `meta-llama/Llama-Vision-Free` (vision)
- `deepseek-ai/DeepSeek-R1-Distill-Llama-70B-Free` (reasoning)
- `black-forest-labs/FLUX.1-schnell-Free` (image generation)

## Example: Complete Configuration

Here's a complete example showing multiple providers with different configurations:

```yaml
providers:
  # Standard chat model
  - id: togetherai:meta-llama/Llama-3.3-70B-Instruct-Turbo
    config:
      temperature: 0.7
      max_tokens: 2048

  # Vision model
  - id: togetherai:meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo
    config:
      temperature: 0.2

  # Model with function calling and JSON mode
  - id: togetherai:mistralai/Mixtral-8x7B-Instruct-v0.1
    config:
      temperature: 0.0
      max_tokens: 1024
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

For complete information about available models and capabilities, refer to the [Together AI documentation](https://docs.together.ai/docs/chat-models).
