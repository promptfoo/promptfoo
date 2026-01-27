---
title: Vercel AI Gateway
sidebar_label: Vercel AI Gateway
sidebar_position: 48
description: Access OpenAI, Anthropic, Google, and 20+ AI providers through Vercel's unified AI Gateway. Supports text generation, streaming, structured output, and embeddings.
---

# Vercel AI Gateway

[Vercel AI Gateway](https://vercel.com/docs/ai-gateway) provides a unified interface to access AI models from 20+ providers through a single API. This provider uses the official [Vercel AI SDK](https://ai-sdk.dev/).

## Setup

1. Enable AI Gateway in your [Vercel Dashboard](https://vercel.com/dashboard)
2. Get your API key from the AI Gateway settings
3. Set the `VERCEL_AI_GATEWAY_API_KEY` environment variable or specify `apiKey` in your config

```bash
export VERCEL_AI_GATEWAY_API_KEY=your_api_key_here
```

## Usage

### Provider Format

The Vercel provider uses the format: `vercel:<provider>/<model>`

```yaml
providers:
  - vercel:openai/gpt-4o-mini
  - vercel:anthropic/claude-sonnet-4.5
  - vercel:google/gemini-2.5-flash
```

### Embedding Models

For embedding models, use the `embedding:` prefix:

```yaml
providers:
  - vercel:embedding:openai/text-embedding-3-small
```

## Configuration

### Basic Configuration

```yaml title="promptfooconfig.yaml"
providers:
  - id: vercel:openai/gpt-4o-mini
    config:
      temperature: 0.7
      maxTokens: 1000
```

### Full Configuration Options

```yaml title="promptfooconfig.yaml"
providers:
  - id: vercel:anthropic/claude-sonnet-4.5
    config:
      # Authentication
      apiKey: ${VERCEL_AI_GATEWAY_API_KEY}
      apiKeyEnvar: CUSTOM_API_KEY_VAR # Use a custom env var name

      # Model settings
      temperature: 0.7
      maxTokens: 2000
      topP: 0.9
      topK: 40
      frequencyPenalty: 0.5
      presencePenalty: 0.3
      stopSequences:
        - '\n\n'

      # Request settings
      timeout: 60000
      headers:
        Custom-Header: 'value'

      # Streaming
      streaming: true
```

### Configuration Parameters

| Parameter          | Type     | Description                                  |
| ------------------ | -------- | -------------------------------------------- |
| `apiKey`           | string   | Vercel AI Gateway API key                    |
| `apiKeyEnvar`      | string   | Custom environment variable name for API key |
| `temperature`      | number   | Controls randomness (0.0 to 1.0)             |
| `maxTokens`        | number   | Maximum number of tokens to generate         |
| `topP`             | number   | Nucleus sampling parameter                   |
| `topK`             | number   | Top-k sampling parameter                     |
| `frequencyPenalty` | number   | Penalizes frequent tokens                    |
| `presencePenalty`  | number   | Penalizes tokens based on presence           |
| `stopSequences`    | string[] | Sequences where generation stops             |
| `timeout`          | number   | Request timeout in milliseconds              |
| `headers`          | object   | Additional HTTP headers                      |
| `streaming`        | boolean  | Enable streaming responses                   |
| `responseSchema`   | object   | JSON schema for structured output            |
| `baseUrl`          | string   | Override the AI Gateway base URL             |

## Structured Output

Generate structured JSON output by providing a JSON schema:

```yaml title="promptfooconfig.yaml"
providers:
  - id: vercel:openai/gpt-4o
    config:
      responseSchema:
        type: object
        properties:
          sentiment:
            type: string
            enum: [positive, negative, neutral]
          confidence:
            type: number
          keywords:
            type: array
            items:
              type: string
        required:
          - sentiment
          - confidence

prompts:
  - 'Analyze the sentiment of this text: {{text}}'

tests:
  - vars:
      text: 'I love this product!'
    assert:
      - type: javascript
        value: output.sentiment === 'positive'
```

## Streaming

Enable streaming for real-time responses:

```yaml title="promptfooconfig.yaml"
providers:
  - id: vercel:anthropic/claude-sonnet-4.5
    config:
      streaming: true
      maxTokens: 2000
```

## Supported Providers

The Vercel AI Gateway supports models from these providers:

| Provider   | Example Models                                              |
| ---------- | ----------------------------------------------------------- |
| OpenAI     | `openai/gpt-5`, `openai/o3-mini`, `openai/gpt-4o-mini`      |
| Anthropic  | `anthropic/claude-sonnet-4.5`, `anthropic/claude-haiku-4.5` |
| Google     | `google/gemini-2.5-flash`, `google/gemini-2.5-pro`          |
| Mistral    | `mistral/mistral-large`, `mistral/magistral-medium`         |
| Cohere     | `cohere/command-a`                                          |
| DeepSeek   | `deepseek/deepseek-r1`, `deepseek/deepseek-v3`              |
| Perplexity | `perplexity/sonar-pro`, `perplexity/sonar-reasoning`        |
| xAI        | `xai/grok-3`, `xai/grok-4`                                  |

For a complete list, see the [Vercel AI Gateway documentation](https://vercel.com/docs/ai-gateway/models-and-providers).

## Embedding Models

Generate embeddings for text similarity, search, and RAG applications:

```yaml title="promptfooconfig.yaml"
providers:
  - vercel:embedding:openai/text-embedding-3-small

prompts:
  - 'Generate embedding for: {{text}}'

tests:
  - vars:
      text: 'Hello world'
    assert:
      - type: is-valid-embedding
```

Supported embedding models:

| Provider | Example Models                                                   |
| -------- | ---------------------------------------------------------------- |
| OpenAI   | `openai/text-embedding-3-small`, `openai/text-embedding-3-large` |
| Google   | `google/gemini-embedding-001`, `google/text-embedding-005`       |
| Cohere   | `cohere/embed-v4.0`                                              |
| Voyage   | `voyage/voyage-3.5`, `voyage/voyage-code-3`                      |

## Examples

### Multi-Provider Comparison

```yaml title="promptfooconfig.yaml"
providers:
  - id: vercel:openai/gpt-4o-mini
    config:
      temperature: 0.7
  - id: vercel:anthropic/claude-sonnet-4.5
    config:
      temperature: 0.7
  - id: vercel:google/gemini-2.5-flash
    config:
      temperature: 0.7

prompts:
  - 'Explain {{concept}} in simple terms'

tests:
  - vars:
      concept: 'quantum computing'
    assert:
      - type: llm-rubric
        value: 'The response should be easy to understand'
```

### JSON Response with Validation

```yaml title="promptfooconfig.yaml"
providers:
  - id: vercel:openai/gpt-4o
    config:
      responseSchema:
        type: object
        properties:
          summary:
            type: string
          topics:
            type: array
            items:
              type: string
          wordCount:
            type: integer
        required:
          - summary
          - topics

prompts:
  - 'Analyze this article and return a structured summary: {{article}}'

tests:
  - vars:
      article: 'Long article text...'
    assert:
      - type: javascript
        value: 'Array.isArray(output.topics) && output.topics.length > 0'
```

## Environment Variables

| Variable                     | Description                 |
| ---------------------------- | --------------------------- |
| `VERCEL_AI_GATEWAY_API_KEY`  | API key for AI Gateway      |
| `VERCEL_AI_GATEWAY_BASE_URL` | Override the AI Gateway URL |

## Troubleshooting

### Common Issues

1. **Authentication Failed**: Ensure your `VERCEL_AI_GATEWAY_API_KEY` is set correctly
2. **Model Not Found**: Check that the provider/model combination is supported
3. **Request Timeout**: Increase the `timeout` configuration value

### Debug Mode

Enable debug logging to see detailed request/response information:

```bash
LOG_LEVEL=debug promptfoo eval
```

## Related Links

- [Vercel AI SDK Documentation](https://ai-sdk.dev/)
- [Vercel AI Gateway](https://vercel.com/docs/ai-gateway)
- [Supported Providers](https://vercel.com/docs/ai-gateway/models-and-providers)
- [promptfoo Provider Guide](/docs/providers/)
