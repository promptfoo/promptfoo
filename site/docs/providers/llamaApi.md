---
title: Meta Llama API
description: Use Meta's hosted Llama API service for text generation and multimodal tasks with promptfoo
---

# Meta Llama API

The Llama API provider enables you to use Meta's hosted Llama models through their official API service. This includes access to the latest Llama 4 multimodal models and Llama 3.3 text models, as well as accelerated variants from partners like Cerebras and Groq.

## Setup

First, you'll need to get an API key from Meta:

1. Visit [llama.developer.meta.com](https://llama.developer.meta.com)
2. Sign up for an account and join the waitlist
3. Create an API key in the dashboard
4. Set the API key as an environment variable:

```bash
export LLAMA_API_KEY="your_api_key_here"
```

## Configuration

Use the `llamaapi:` prefix to specify Llama API models:

```yaml
providers:
  - llamaapi:Llama-4-Maverick-17B-128E-Instruct-FP8
  - llamaapi:Llama-3.3-70B-Instruct
  - llamaapi:chat:Llama-3.3-8B-Instruct # Explicit chat format
```

### Provider Options

```yaml
providers:
  - id: llamaapi:Llama-4-Maverick-17B-128E-Instruct-FP8
    config:
      temperature: 0.7 # Controls randomness (0.0-2.0)
      max_tokens: 1000 # Maximum response length
      top_p: 0.9 # Nucleus sampling parameter
      frequency_penalty: 0 # Reduce repetition (-2.0 to 2.0)
      presence_penalty: 0 # Encourage topic diversity (-2.0 to 2.0)
      stream: false # Enable streaming responses
```

## Available Models

### Meta-Hosted Models

#### Llama 4 (Multimodal)

- **`Llama-4-Maverick-17B-128E-Instruct-FP8`**: Industry-leading multimodal model with image and text understanding
- **`Llama-4-Scout-17B-16E-Instruct-FP8`**: Class-leading multimodal model with superior visual intelligence

Both Llama 4 models support:

- **Input**: Text and images
- **Output**: Text
- **Context Window**: 128k tokens
- **Rate Limits**: 3,000 RPM, 1M TPM

#### Llama 3.3 (Text-Only)

- **`Llama-3.3-70B-Instruct`**: Enhanced performance text model
- **`Llama-3.3-8B-Instruct`**: Lightweight, ultra-fast variant

Both Llama 3.3 models support:

- **Input**: Text only
- **Output**: Text
- **Context Window**: 128k tokens
- **Rate Limits**: 3,000 RPM, 1M TPM

### Accelerated Variants (Preview)

For applications requiring ultra-low latency:

- **`Cerebras-Llama-4-Maverick-17B-128E-Instruct`** (32k context, 900 RPM, 300k TPM)
- **`Cerebras-Llama-4-Scout-17B-16E-Instruct`** (32k context, 600 RPM, 200k TPM)
- **`Groq-Llama-4-Maverick-17B-128E-Instruct`** (128k context, 1000 RPM, 600k TPM)

Note: Accelerated variants are text-only and don't support image inputs.

## Features

### Text Generation

Basic text generation works with all models:

```yaml
providers:
  - llamaapi:Llama-3.3-70B-Instruct

prompts:
  - 'Explain quantum computing in simple terms'

tests:
  - vars: {}
    assert:
      - type: contains
        value: 'quantum'
```

### Multimodal (Image + Text)

Llama 4 models can process images alongside text:

```yaml
providers:
  - llamaapi:Llama-4-Maverick-17B-128E-Instruct-FP8

prompts:
  - role: user
    content:
      - type: text
        text: 'What do you see in this image?'
      - type: image_url
        image_url:
          url: 'https://example.com/image.jpg'

tests:
  - vars: {}
    assert:
      - type: llm-rubric
        value: 'Accurately describes the image content'
```

#### Image Requirements

- **Supported formats**: JPEG, PNG, GIF, ICO
- **Maximum file size**: 25MB per image
- **Maximum images per request**: 9
- **Input methods**: URL or base64 encoding

### JSON Structured Output

Generate responses following a specific JSON schema:

```yaml
providers:
  - id: llamaapi:Llama-4-Maverick-17B-128E-Instruct-FP8
    config:
      temperature: 0.1
      response_format:
        type: json_schema
        json_schema:
          name: product_review
          schema:
            type: object
            properties:
              rating:
                type: number
                minimum: 1
                maximum: 5
              summary:
                type: string
              pros:
                type: array
                items:
                  type: string
              cons:
                type: array
                items:
                  type: string
            required: ['rating', 'summary']

prompts:
  - 'Review this product: {{product_description}}'

tests:
  - vars:
      product_description: 'Wireless headphones with great sound quality but short battery life'
    assert:
      - type: is-json
      - type: javascript
        value: 'JSON.parse(output).rating >= 1 && JSON.parse(output).rating <= 5'
```

### Tool Calling

Enable models to call external functions:

```yaml
providers:
  - id: llamaapi:Llama-3.3-70B-Instruct
    config:
      tools:
        - type: function
          function:
            name: get_weather
            description: Get current weather for a location
            parameters:
              type: object
              properties:
                location:
                  type: string
                  description: City and state, e.g. San Francisco, CA
                unit:
                  type: string
                  enum: ['celsius', 'fahrenheit']
              required: ['location']

prompts:
  - "What's the weather like in {{city}}?"

tests:
  - vars:
      city: 'New York, NY'
    assert:
      - type: function-call
        value: get_weather
      - type: javascript
        value: "output.arguments.location.includes('New York')"
```

### Streaming

Enable real-time response streaming:

```yaml
providers:
  - id: llamaapi:Llama-3.3-8B-Instruct
    config:
      stream: true
      temperature: 0.7

prompts:
  - 'Write a short story about {{topic}}'

tests:
  - vars:
      topic: 'time travel'
    assert:
      - type: contains
        value: 'time'
```

## Rate Limits and Quotas

All rate limits are applied per team (across all API keys):

| Model Type      | Requests/min | Tokens/min      |
| --------------- | ------------ | --------------- |
| Standard Models | 3,000        | 1,000,000       |
| Cerebras Models | 600-900      | 200,000-300,000 |
| Groq Models     | 1,000        | 600,000         |

Rate limit information is available in response headers:

- `x-ratelimit-limit-tokens`: Total token limit
- `x-ratelimit-remaining-tokens`: Remaining tokens
- `x-ratelimit-limit-requests`: Total request limit
- `x-ratelimit-remaining-requests`: Remaining requests

## Model Selection Guide

### Choose Llama 4 Models When:

- You need multimodal capabilities (text + images)
- You want the most advanced reasoning and intelligence
- Quality is more important than speed
- You're building complex AI applications

### Choose Llama 3.3 Models When:

- You only need text processing
- You want a balance of quality and speed
- Cost efficiency is important
- You're building chatbots or content generation tools

### Choose Accelerated Variants When:

- Ultra-low latency is critical
- You're building real-time applications
- Text-only processing is sufficient
- You can work within reduced context windows (Cerebras models)

## Best Practices

### Multimodal Usage

1. **Optimize image sizes**: Larger images consume more tokens
2. **Use appropriate formats**: JPEG for photos, PNG for graphics
3. **Batch multiple images**: Up to 9 images per request when possible

### Token Management

1. **Monitor context windows**: 32k-128k depending on model
2. **Use `max_tokens` appropriately**: Control response length
3. **Estimate image tokens**: ~145 tokens per 336x336 pixel tile

### Error Handling

1. **Implement retry logic**: For rate limits and transient failures
2. **Validate inputs**: Check image formats and sizes
3. **Monitor rate limits**: Use response headers to avoid limits

### Performance Optimization

1. **Choose the right model**: Balance quality vs. speed vs. cost
2. **Use streaming**: For better user experience with long responses
3. **Cache responses**: When appropriate for your use case

## Troubleshooting

### Authentication Issues

```
Error: 401 Unauthorized
```

- Verify your `LLAMA_API_KEY` environment variable is set
- Check that your API key is valid at llama.developer.meta.com
- Ensure you have access to the Llama API (currently in preview)

### Rate Limiting

```
Error: 429 Too Many Requests
```

- Check your current rate limit usage
- Implement exponential backoff retry logic
- Consider distributing load across different time periods

### Model Errors

```
Error: Model not found
```

- Verify the model name spelling
- Check model availability in your region
- Ensure you're using supported model IDs

### Image Processing Issues

```
Error: Invalid image format
```

- Check image format (JPEG, PNG, GIF, ICO only)
- Verify image size is under 25MB
- Ensure image URL is accessible publicly

## Data Privacy

Meta Llama API has strong data commitments:

- ✅ **No training on your data**: Your inputs and outputs are not used for model training
- ✅ **Encryption**: Data encrypted at rest and in transit
- ✅ **No ads**: Data not used for advertising
- ✅ **Storage separation**: Strict access controls and isolated storage
- ✅ **Compliance**: Regular vulnerability management and compliance audits

## Comparison with Other Providers

| Feature        | Llama API    | OpenAI | Anthropic |
| -------------- | ------------ | ------ | --------- |
| Multimodal     | ✅ (Llama 4) | ✅     | ✅        |
| Tool Calling   | ✅           | ✅     | ✅        |
| JSON Schema    | ✅           | ✅     | ❌        |
| Streaming      | ✅           | ✅     | ✅        |
| Context Window | 32k-128k     | 128k   | 200k      |
| Data Training  | ❌           | ✅     | ❌        |

## Examples

Check out the [examples directory](https://github.com/promptfoo/promptfoo/tree/main/examples/llama-api) for:

- **Basic chat**: Simple text generation
- **Multimodal**: Image understanding tasks
- **Structured output**: JSON schema validation
- **Tool calling**: Function calling examples
- **Model comparison**: Performance benchmarking

## Related Providers

- [OpenAI](/docs/providers/openai) - Similar API structure and capabilities
- [Anthropic](/docs/providers/anthropic) - Alternative AI provider
- [Together AI](/docs/providers/togetherai) - Hosts various open-source models including Llama
- [OpenRouter](/docs/providers/openrouter) - Provides access to multiple AI models including Llama

For questions and support, visit the [Llama API documentation](https://llama.developer.meta.com/docs) or join the [promptfoo Discord community](https://discord.gg/promptfoo).
