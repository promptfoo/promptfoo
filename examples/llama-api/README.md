# Llama API Examples

This directory contains examples demonstrating how to use Meta's Llama API with promptfoo.

## Prerequisites

1. **Get an API Key**: Sign up at [llama.developer.meta.com](https://llama.developer.meta.com) and create an API key
2. **Set Environment Variable**:
   ```bash
   export LLAMA_API_KEY="your_api_key_here"
   ```

## Available Models

### Meta-Hosted Models

- **Llama-4-Maverick-17B-128E-Instruct-FP8**: Multimodal (text + image → text), 128k context
- **Llama-4-Scout-17B-16E-Instruct-FP8**: Multimodal (text + image → text), 128k context
- **Llama-3.3-70B-Instruct**: Text-only, 128k context
- **Llama-3.3-8B-Instruct**: Text-only, 128k context

### Accelerated Variants (Preview)

- **Cerebras-Llama-4-Maverick-17B-128E-Instruct**: Text-only, 32k context
- **Cerebras-Llama-4-Scout-17B-16E-Instruct**: Text-only, 32k context
- **Groq-Llama-4-Maverick-17B-128E-Instruct**: Text-only, 128k context

## Examples

### 1. Basic Chat (`basic-chat.yaml`)

Simple chat completions across different Llama models:

```bash
promptfoo eval -c examples/llama-api/basic-chat.yaml
```

**Features demonstrated:**

- Basic text generation
- Model comparison
- Temperature and token limit configuration

### 2. Multimodal (`multimodal.yaml`)

Image understanding with Llama 4 models:

```bash
promptfoo eval -c examples/llama-api/multimodal.yaml
```

**Features demonstrated:**

- Image + text input processing
- Visual scene description
- Object and text recognition in images

### 3. Structured Output (`structured-output.yaml`)

JSON schema-based structured responses:

```bash
promptfoo eval -c examples/llama-api/structured-output.yaml
```

**Features demonstrated:**

- JSON schema validation
- Product analysis with structured output
- Sentiment analysis with confidence scores

### 4. Tool Calling (`tool-calling.yaml`)

Function calling capabilities:

```bash
promptfoo eval -c examples/llama-api/tool-calling.yaml
```

**Features demonstrated:**

- Weather data retrieval
- Mathematical calculations
- Email composition
- Image analysis tools

### 5. Model Comparison (`model-comparison.yaml`)

Compare performance across all Llama API models:

```bash
promptfoo eval -c examples/llama-api/model-comparison.yaml
```

**Features demonstrated:**

- Head-to-head model comparison
- Consistent task evaluation
- Performance benchmarking

## Configuration Options

### Basic Provider Configuration

```yaml
providers:
  - id: llamaapi:Llama-4-Maverick-17B-128E-Instruct-FP8
    config:
      temperature: 0.7 # Controls randomness (0.0-2.0)
      max_tokens: 1000 # Maximum response length
      top_p: 0.9 # Nucleus sampling parameter
      frequency_penalty: 0 # Reduce repetition
      presence_penalty: 0 # Encourage topic diversity
```

### Multimodal Configuration

```yaml
prompts:
  - role: user
    content:
      - type: text
        text: 'What do you see in this image?'
      - type: image_url
        image_url:
          url: 'https://example.com/image.jpg'
          # Or use base64: "data:image/jpeg;base64,..."
```

### Structured Output Configuration

```yaml
providers:
  - id: llamaapi:Llama-3.3-70B-Instruct
    config:
      response_format:
        type: json_schema
        json_schema:
          name: response_schema
          schema:
            type: object
            properties:
              result:
                type: string
            required: ['result']
```

### Tool Calling Configuration

```yaml
providers:
  - id: llamaapi:Llama-3.3-70B-Instruct
    config:
      tools:
        - type: function
          function:
            name: function_name
            description: 'Function description'
            parameters:
              type: object
              properties:
                param1:
                  type: string
                  description: 'Parameter description'
              required: ['param1']
```

## Rate Limits

| Model           | RPM     | TPM             |
| --------------- | ------- | --------------- |
| Standard Models | 3,000   | 1,000,000       |
| Cerebras Models | 600-900 | 200,000-300,000 |
| Groq Models     | 1,000   | 600,000         |

## Tips

1. **Model Selection**:
   - Use Llama 4 models for multimodal tasks
   - Use Llama 3.3-8B for faster, cost-effective text generation
   - Use accelerated variants for low-latency requirements

2. **Multimodal Usage**:
   - Supported formats: JPEG, PNG, GIF, ICO
   - Max file size: 25MB per image
   - Max images per request: 9

3. **Performance Optimization**:
   - Lower temperature for more deterministic outputs
   - Use `max_tokens` to control response length
   - Consider context window limits (32k-128k tokens)

4. **Error Handling**:
   - Monitor rate limits via response headers
   - Implement retry logic for transient failures
   - Validate model names against supported models

## Troubleshooting

### Common Issues

1. **Invalid API Key**

   ```
   Error: 401 Unauthorized
   ```

   - Verify `LLAMA_API_KEY` environment variable
   - Check API key validity at llama.developer.meta.com

2. **Rate Limit Exceeded**

   ```
   Error: 429 Too Many Requests
   ```

   - Reduce request frequency
   - Check rate limit headers in responses

3. **Model Not Found**

   ```
   Error: Model not found
   ```

   - Verify model name spelling
   - Check model availability in your region

4. **Context Window Exceeded**

   ```
   Error: Token limit exceeded
   ```

   - Reduce input/output token count
   - Check model-specific context limits

For more examples and advanced usage, visit the [promptfoo documentation](https://promptfoo.dev).
