---
sidebar_label: Cerebras
---

# Cerebras

This provider enables you to use Cerebras models through their [Inference API](https://docs.cerebras.ai).

Cerebras offers an OpenAI-compatible API for various large language models including Llama models, DeepSeek, and more. You can use it as a drop-in replacement for applications currently using the [OpenAI API](/docs/providers/openai/) chat endpoints.

## Setup

Generate an API key from the Cerebras platform. Then set the `CEREBRAS_API_KEY` environment variable or pass it via the `apiKey` configuration field.

```bash
export CEREBRAS_API_KEY=your_api_key_here
```

Or in your config:

```yaml
providers:
  - id: cerebras:llama3.1-8b
    config:
      apiKey: your_api_key_here
```

## Provider Format

The Cerebras provider uses a simple format:

- `cerebras:<model name>` - Using the chat completion interface for all models

## Available Models

The Cerebras Inference API officially supports these models:

- `llama-4-scout-17b-16e-instruct` - Llama 4 Scout 17B model with 16 expert MoE
- `llama3.1-8b` - Llama 3.1 8B model
- `llama-3.3-70b` - Llama 3.3 70B model
- `deepSeek-r1-distill-llama-70B` (private preview)

To get the current list of available models, use the `/models` endpoint:

```bash
curl https://api.cerebras.ai/v1/models -H "Authorization: Bearer your_api_key_here"
```

## Parameters

The provider accepts standard OpenAI chat parameters:

- `temperature` - Controls randomness (0.0 to 1.5)
- `max_completion_tokens` - Maximum number of tokens to generate
- `top_p` - Nucleus sampling parameter
- `stop` - Sequences where the API will stop generating further tokens
- `seed` - Seed for deterministic generation
- `response_format` - Controls the format of the model response (e.g., for JSON output)
- `logprobs` - Whether to return log probabilities of the output tokens

## Advanced Capabilities

### Structured Outputs

Cerebras models support structured outputs with JSON schema enforcement to ensure your AI-generated responses follow a consistent, predictable format. This makes it easier to build reliable applications that can process AI outputs programmatically.

To use structured outputs, set the `response_format` parameter to include a JSON schema:

```yaml
providers:
  - id: cerebras:llama-4-scout-17b-16e-instruct
    config:
      response_format:
        type: 'json_schema'
        json_schema:
          name: 'movie_schema'
          strict: true
          schema:
            type: 'object'
            properties:
              title: { 'type': 'string' }
              director: { 'type': 'string' }
              year: { 'type': 'integer' }
            required: ['title', 'director', 'year']
            additionalProperties: false
```

Alternatively, you can use simple JSON mode by setting `response_format` to `{"type": "json_object"}`.

### Tool Use

Cerebras models support tool use (function calling), enabling LLMs to programmatically execute specific tasks. To use this feature, define the tools the model can use:

```yaml
providers:
  - id: cerebras:llama-4-scout-17b-16e-instruct
    config:
      tools:
        - type: 'function'
          function:
            name: 'calculate'
            description: 'A calculator that can perform basic arithmetic operations'
            parameters:
              type: 'object'
              properties:
                expression:
                  type: 'string'
                  description: 'The mathematical expression to evaluate'
              required: ['expression']
            strict: true
```

When using tool calling, you'll need to process the model's response and handle any tool calls it makes, then provide the results back to the model for the final response.

## Example Configuration

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Cerebras model evaluation
prompts:
  - You are an expert in {{topic}}. Explain {{question}} in simple terms.
providers:
  - id: cerebras:llama3.1-8b
    config:
      temperature: 0.7
      max_completion_tokens: 1024
  - id: cerebras:llama-3.3-70b
    config:
      temperature: 0.7
      max_completion_tokens: 1024
tests:
  - vars:
      topic: quantum computing
      question: Explain quantum entanglement in simple terms
    assert:
      - type: contains-any
        value: ['entangled', 'correlated', 'quantum state']
  - vars:
      topic: machine learning
      question: What is the difference between supervised and unsupervised learning?
    assert:
      - type: contains
        value: 'labeled data'
```

## See Also

- [OpenAI Provider](/docs/providers/openai) - Compatible API format used by Cerebras
- [Configuration Reference](/docs/configuration/reference.md) - Full configuration options for providers
- [Cerebras API Documentation](https://docs.cerebras.ai) - Official API reference
- [Cerebras Structured Outputs Guide](https://docs.cerebras.ai/capabilities/structured-outputs/) - Learn more about JSON schema enforcement
- [Cerebras Tool Use Guide](https://docs.cerebras.ai/capabilities/tool-use/) - Learn more about tool calling capabilities
