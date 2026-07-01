---
description: Use the Nscale Serverless Inference API with promptfoo for model evaluation and testing
---

# Nscale

The Nscale provider enables you to use [Nscale's Serverless Inference API](https://nscale.com/serverless)
models with promptfoo through an OpenAI-compatible interface.

## Setup

Set your Nscale service token as an environment variable:

```bash
export NSCALE_SERVICE_TOKEN=your_service_token_here
```

Alternatively, you can add it to your `.env` file:

```env
NSCALE_SERVICE_TOKEN=your_service_token_here
```

### Obtaining Credentials

You can obtain service tokens by:

1. Signing up at [Nscale](https://nscale.com/)
2. Navigating to your account settings
3. Going to "Service Tokens" section

## Configuration

To use Nscale models in your promptfoo configuration, use the `nscale:` prefix followed by the model name:

```yaml
providers:
  - nscale:openai/gpt-oss-120b
  - nscale:meta/llama-3.3-70b-instruct
  - nscale:qwen/qwen-3-235b-a22b-instruct
```

## Model Types

Nscale supports different types of models through specific endpoint formats:

### Chat Completion Models (Default)

For chat completion models, you can use either format:

```yaml
providers:
  - nscale:chat:<model-id>
  - nscale:<model-id> # Defaults to chat
```

### Completion Models

For text completion models:

```yaml
providers:
  - nscale:completion:<model-id>
```

### Embedding Models

For embedding models:

```yaml
providers:
  - nscale:embedding:Qwen3-Embedding-8B
  - nscale:embeddings:Qwen3-Embedding-8B # Alternative format
```

## Popular Models

Nscale exposes the current catalog through an authenticated OpenAI-compatible endpoint:

```bash
curl -fsS https://inference.api.nscale.com/v1/models \
  -H "Authorization: Bearer $NSCALE_SERVICE_TOKEN"
```

### Text Generation Models

Use a returned `id` after the `nscale:` or `nscale:chat:` prefix.

### Embedding Models

Nscale's embedding API reference currently demonstrates `Qwen3-Embedding-8B`. Confirm it in
your organization's `/v1/models` response before running an eval.

### Text-to-Image Models

Nscale's image API reference currently demonstrates
`nscale:image:black-forest-labs/FLUX.1-schnell`. Confirm it in your organization's catalog before
running an eval.

## Configuration Options

Nscale supports standard OpenAI-compatible parameters:

```yaml
providers:
  - id: nscale:meta-llama/Llama-4-Scout-17B-16E-Instruct
    config:
      temperature: 0.7
      max_tokens: 1024
      top_p: 0.9
      frequency_penalty: 0.1
      presence_penalty: 0.2
      stop: ['END', 'STOP']
      stream: true
```

### Supported Parameters

- `temperature`: Controls randomness (0.0 to 2.0)
- `max_tokens`: Maximum number of tokens to generate
- `top_p`: Nucleus sampling parameter
- `frequency_penalty`: Reduces repetition based on frequency
- `presence_penalty`: Reduces repetition based on presence
- `stop`: Stop sequences to halt generation
- `stream`: Enable streaming responses
- `seed`: Deterministic sampling seed

## Example Configuration

Here's a complete example configuration:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: nscale:meta-llama/Llama-4-Scout-17B-16E-Instruct
    label: nscale-llama-scout
    config:
      temperature: 0.7
      max_tokens: 512

prompts:
  - 'Explain {{concept}} in simple terms'
  - 'What are the key benefits of {{concept}}?'

tests:
  - vars:
      concept: quantum computing
    assert:
      - type: contains
        value: 'quantum'
```

## Pricing

Pricing varies by model. See [Nscale's pricing page](https://docs.nscale.com/pricing) for current
rates before adding cost assertions.

## Key Features

- **Serverless**: No infrastructure management required
- **OpenAI Compatible**: Standard API interface

## Error Handling

The Nscale provider includes built-in error handling for common issues:

- Network timeouts and retries
- Rate limiting
- Invalid API key errors
- Model availability issues

## Support

For support with the Nscale provider:

- [Nscale Documentation](https://docs.nscale.com/)
- [Nscale Community Discord](https://discord.gg/nscale)
- [promptfoo GitHub Issues](https://github.com/promptfoo/promptfoo/issues)
