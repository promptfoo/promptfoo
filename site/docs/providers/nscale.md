---
description: Use Nscale Serverless Inference API with promptfoo for cost-effective AI model evaluation and testing
---

# Nscale

The Nscale provider enables you to use [Nscale's Serverless Inference API](https://nscale.com/serverless) models with promptfoo. Nscale offers cost-effective AI inference with up to 80% savings compared to other providers, zero rate limits, and no cold starts.

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
  - nscale:chat:openai/gpt-oss-120b
  - nscale:openai/gpt-oss-120b # Defaults to chat
```

### Completion Models

For text completion models:

```yaml
providers:
  - nscale:completion:openai/gpt-oss-20b
```

### Embedding Models

For embedding models:

```yaml
providers:
  - nscale:embedding:qwen/qwen3-embedding-8b
  - nscale:embeddings:qwen/qwen3-embedding-8b # Alternative format
```

## Popular Models

Nscale offers a wide range of popular AI models:

### Text Generation Models

| Model                         | Provider Format                                 | Use Case                            |
| ----------------------------- | ----------------------------------------------- | ----------------------------------- |
| GPT OSS 120B                  | `nscale:openai/gpt-oss-120b`                    | General-purpose reasoning and tasks |
| GPT OSS 20B                   | `nscale:openai/gpt-oss-20b`                     | Lightweight general-purpose model   |
| Qwen 3 235B Instruct          | `nscale:qwen/qwen-3-235b-a22b-instruct`         | Large-scale language understanding  |
| Qwen 3 235B Instruct 2507     | `nscale:qwen/qwen-3-235b-a22b-instruct-2507`    | Latest Qwen 3 235B variant          |
| Qwen 3 4B Thinking 2507       | `nscale:qwen/qwen-3-4b-thinking-2507`           | Reasoning and thinking tasks        |
| Qwen 3 8B                     | `nscale:qwen/qwen-3-8b`                         | Mid-size general-purpose model      |
| Qwen 3 14B                    | `nscale:qwen/qwen-3-14b`                        | Enhanced reasoning capabilities     |
| Qwen 3 32B                    | `nscale:qwen/qwen-3-32b`                        | Large-scale reasoning and analysis  |
| Qwen 2.5 Coder 3B Instruct    | `nscale:qwen/qwen-2.5-coder-3b-instruct`        | Lightweight code generation         |
| Qwen 2.5 Coder 7B Instruct    | `nscale:qwen/qwen-2.5-coder-7b-instruct`        | Code generation and programming     |
| Qwen 2.5 Coder 32B Instruct   | `nscale:qwen/qwen-2.5-coder-32b-instruct`       | Advanced code generation            |
| Qwen QwQ 32B                  | `nscale:qwen/qwq-32b`                           | Specialized reasoning model         |
| Llama 3.3 70B Instruct        | `nscale:meta/llama-3.3-70b-instruct`            | High-quality instruction following  |
| Llama 3.1 8B Instruct         | `nscale:meta/llama-3.1-8b-instruct`             | Efficient instruction following     |
| Llama 4 Scout 17B             | `nscale:meta/llama-4-scout-17b-16e-instruct`    | Image-Text-to-Text capabilities     |
| DeepSeek R1 Distill Llama 70B | `nscale:deepseek/deepseek-r1-distill-llama-70b` | Efficient reasoning model           |
| DeepSeek R1 Distill Llama 8B  | `nscale:deepseek/deepseek-r1-distill-llama-8b`  | Lightweight reasoning model         |
| DeepSeek R1 Distill Qwen 1.5B | `nscale:deepseek/deepseek-r1-distill-qwen-1.5b` | Ultra-lightweight reasoning         |
| DeepSeek R1 Distill Qwen 7B   | `nscale:deepseek/deepseek-r1-distill-qwen-7b`   | Compact reasoning model             |
| DeepSeek R1 Distill Qwen 14B  | `nscale:deepseek/deepseek-r1-distill-qwen-14b`  | Mid-size reasoning model            |
| DeepSeek R1 Distill Qwen 32B  | `nscale:deepseek/deepseek-r1-distill-qwen-32b`  | Large reasoning model               |
| Devstral Small 2505           | `nscale:mistral/devstral-small-2505`            | Code generation and development     |
| Mixtral 8x22B Instruct        | `nscale:mistral/mixtral-8x22b-instruct-v0.1`    | Large mixture-of-experts model      |

### Embedding Models

| Model               | Provider Format                            | Use Case                       |
| ------------------- | ------------------------------------------ | ------------------------------ |
| Qwen 3 Embedding 8B | `nscale:embedding:Qwen/Qwen3-Embedding-8B` | Text embeddings and similarity |

### Text-to-Image Models

| Model                 | Provider Format                                         | Use Case                      |
| --------------------- | ------------------------------------------------------- | ----------------------------- |
| Flux.1 Schnell        | `nscale:image:BlackForestLabs/FLUX.1-schnell`           | Fast image generation         |
| Stable Diffusion XL   | `nscale:image:stabilityai/stable-diffusion-xl-base-1.0` | High-quality image generation |
| SDXL Lightning 4-step | `nscale:image:ByteDance/SDXL-Lightning-4step`           | Ultra-fast image generation   |
| SDXL Lightning 8-step | `nscale:image:ByteDance/SDXL-Lightning-8step`           | Balanced speed and quality    |

## Configuration Options

Nscale supports standard OpenAI-compatible parameters:

```yaml
providers:
  - id: nscale:openai/gpt-oss-120b
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

```yaml
providers:
  - id: nscale-gpt-oss
    config:
      temperature: 0.7
      max_tokens: 512
  - id: nscale-llama
    config:
      temperature: 0.5
      max_tokens: 1024

prompts:
  - 'Explain {{concept}} in simple terms'
  - 'What are the key benefits of {{concept}}?'

tests:
  - vars:
      concept: quantum computing
    assert:
      - type: contains
        value: 'quantum'
      - type: llm-rubric
        value: 'Explanation should be clear and accurate'
```

## Pricing

Nscale offers highly competitive pricing:

- **Text Generation**: Starting from $0.01 input / $0.03 output per 1M tokens
- **Embeddings**: $0.04 per 1M tokens
- **Image Generation**: Starting from $0.0008 per mega-pixel

For the most current pricing information, visit [Nscale's pricing page](https://docs.nscale.com/pricing).

## Key Features

- **Cost-Effective**: Up to 80% savings compared to other providers
- **Zero Rate Limits**: No throttling or request limits
- **No Cold Starts**: Instant response times
- **Serverless**: No infrastructure management required
- **OpenAI Compatible**: Standard API interface
- **Global Availability**: Low-latency inference worldwide

## Error Handling

The Nscale provider includes built-in error handling for common issues:

- Network timeouts and retries
- Rate limiting (though Nscale has zero rate limits)
- Invalid API key errors
- Model availability issues

## Support

For support with the Nscale provider:

- [Nscale Documentation](https://docs.nscale.com/)
- [Nscale Community Discord](https://discord.gg/nscale)
- [promptfoo GitHub Issues](https://github.com/promptfoo/promptfoo/issues)
