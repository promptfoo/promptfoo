# Together AI

[Together AI](https://www.together.ai/) provides access to open-source models through an API compatible with OpenAI's interface.

## OpenAI Compatibility

Together AI's API is compatible with OpenAI's API, which means all parameters available in the [OpenAI provider](/docs/providers/openai/) work with Together AI.

## Basic Configuration

Configure a Together AI model in your promptfoo configuration:

```yaml
providers:
  - id: togetherai:meta-llama/Llama-3.3-70B-Instruct-Turbo
    config:
      temperature: 0.7
```

The provider requires an API key stored in the `TOGETHER_API_KEY` environment variable.

## Model Types

Together AI offers several types of models:

```yaml
# Chat model (default)
- id: togetherai:meta-llama/Llama-3.3-70B-Instruct-Turbo

# Other model types
- id: togetherai:completion:meta-llama/Llama-2-70b-hf
- id: togetherai:embedding:togethercomputer/m2-bert-80M-8k-retrieval
```

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

Together AI offers over 200 models. Here are some popular options by category:

### Chat Models

- **Llama 3**:
  - `meta-llama/Llama-3.3-70B-Instruct-Turbo`
  - `meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo`
  - `meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo`
- **Reasoning**:
  - `deepseek-ai/DeepSeek-R1`
  - `deepseek-ai/DeepSeek-V3`
- **Mixture of Experts**:
  - `mistralai/Mixtral-8x7B-Instruct-v0.1`
  - `mistralai/Mixtral-8x22B-Instruct-v0.1`
- **Qwen**:
  - `Qwen/Qwen2.5-7B-Instruct-Turbo`
  - `Qwen/Qwen2.5-72B-Instruct`

### Vision Models

- `meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo`
- `meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo`
- `Qwen/Qwen2-VL-72B-Instruct`

### Embedding Models

- `togethercomputer/m2-bert-80M-8k-retrieval`
- `mistralai/Mixtral-8x7B-Embeddings`
- `Xenova/all-MiniLM-L6-v2`

### Free Endpoints

Together AI offers free tiers with reduced rate limits:

- `meta-llama/Llama-3.3-70B-Instruct-Turbo-Free`
- `meta-llama/Llama-Vision-Free`
- `deepseek-ai/DeepSeek-R1-Distill-Llama-70B-Free`

## Example Configuration

```yaml
providers:
  # Chat model
  - id: togetherai:meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo
    config:
      temperature: 0.7
      top_k: 50

  # Model with function calling
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
