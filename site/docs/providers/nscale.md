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
  - nscale:meta-llama/Llama-3.3-70B-Instruct
  - nscale:Qwen/Qwen3-235B-A22B-Instruct-2507
```

Model IDs are the upstream Hugging Face repository IDs and are case-sensitive.

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
  - nscale:embedding:Qwen/Qwen3-Embedding-8B
  - nscale:embeddings:Qwen/Qwen3-Embedding-8B # Alternative format
```

### Text-to-Image Models

For image generation models:

```yaml
providers:
  - nscale:image:black-forest-labs/FLUX.1-schnell
```

## Popular Models

Model IDs are the upstream Hugging Face repository IDs and are case-sensitive
(`meta-llama/Llama-3.3-70B-Instruct`, not `meta/llama-3.3-70b-instruct`). The
authoritative list for your account is `GET https://inference.api.nscale.com/v1/models`,
which also returns pricing and context length:

```bash
curl https://inference.api.nscale.com/v1/models \
  -H "Authorization: Bearer $NSCALE_SERVICE_TOKEN"
```

### Text Generation Models

| Model                          | Provider Format                                    | Use Case                            |
| ------------------------------ | -------------------------------------------------- | ----------------------------------- |
| GPT OSS 120B                   | `nscale:openai/gpt-oss-120b`                       | General-purpose reasoning and tasks |
| GPT OSS 20B                    | `nscale:openai/gpt-oss-20b`                        | Lightweight general-purpose model   |
| Kimi K2.5                      | `nscale:moonshotai/Kimi-K2.5`                      | Large-scale agentic reasoning       |
| Qwen 3 235B A22B               | `nscale:Qwen/Qwen3-235B-A22B`                      | Large-scale language understanding  |
| Qwen 3 235B A22B Instruct 2507 | `nscale:Qwen/Qwen3-235B-A22B-Instruct-2507`        | Latest Qwen 3 235B variant          |
| Qwen 3 4B Instruct 2507        | `nscale:Qwen/Qwen3-4B-Instruct-2507`               | Lightweight instruction following   |
| Qwen 3 4B Thinking 2507        | `nscale:Qwen/Qwen3-4B-Thinking-2507`               | Reasoning and thinking tasks        |
| Qwen 3 8B                      | `nscale:Qwen/Qwen3-8B`                             | Mid-size general-purpose model      |
| Qwen 3 14B                     | `nscale:Qwen/Qwen3-14B`                            | Enhanced reasoning capabilities     |
| Qwen 3 32B                     | `nscale:Qwen/Qwen3-32B`                            | Large-scale reasoning and analysis  |
| Qwen 2.5 Coder 3B Instruct     | `nscale:Qwen/Qwen2.5-Coder-3B-Instruct`            | Lightweight code generation         |
| Qwen 2.5 Coder 7B Instruct     | `nscale:Qwen/Qwen2.5-Coder-7B-Instruct`            | Code generation and programming     |
| Qwen 2.5 Coder 32B Instruct    | `nscale:Qwen/Qwen2.5-Coder-32B-Instruct`           | Advanced code generation            |
| Qwen QwQ 32B                   | `nscale:Qwen/QwQ-32B`                              | Specialized reasoning model         |
| Llama 3.3 70B Instruct         | `nscale:meta-llama/Llama-3.3-70B-Instruct`         | High-quality instruction following  |
| Llama 3.1 8B Instruct          | `nscale:meta-llama/Llama-3.1-8B-Instruct`          | Efficient instruction following     |
| Llama 3.2 11B Vision Instruct  | `nscale:meta-llama/Llama-3.2-11B-Vision-Instruct`  | Vision-language tasks               |
| Llama 4 Scout 17B              | `nscale:meta-llama/Llama-4-Scout-17B-16E-Instruct` | Image-Text-to-Text capabilities     |
| DeepSeek R1 Distill Llama 70B  | `nscale:deepseek-ai/DeepSeek-R1-Distill-Llama-70B` | Efficient reasoning model           |
| DeepSeek R1 Distill Llama 8B   | `nscale:deepseek-ai/DeepSeek-R1-Distill-Llama-8B`  | Lightweight reasoning model         |
| DeepSeek R1 Distill Qwen 1.5B  | `nscale:deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B` | Ultra-lightweight reasoning         |
| DeepSeek R1 Distill Qwen 7B    | `nscale:deepseek-ai/DeepSeek-R1-Distill-Qwen-7B`   | Compact reasoning model             |
| DeepSeek R1 Distill Qwen 14B   | `nscale:deepseek-ai/DeepSeek-R1-Distill-Qwen-14B`  | Mid-size reasoning model            |
| DeepSeek R1 Distill Qwen 32B   | `nscale:deepseek-ai/DeepSeek-R1-Distill-Qwen-32B`  | Large reasoning model               |
| Devstral Small 2505            | `nscale:mistralai/Devstral-Small-2505`             | Code generation and development     |
| Mixtral 8x22B Instruct         | `nscale:mistralai/Mixtral-8x22B-Instruct-v0.1`     | Large mixture-of-experts model      |

### Embedding Models

| Model               | Provider Format                            | Use Case                       |
| ------------------- | ------------------------------------------ | ------------------------------ |
| Qwen 3 Embedding 8B | `nscale:embedding:Qwen/Qwen3-Embedding-8B` | Text embeddings and similarity |

### Text-to-Image Models

| Model               | Provider Format                                         | Use Case                      |
| ------------------- | ------------------------------------------------------- | ----------------------------- |
| Flux.1 Schnell      | `nscale:image:black-forest-labs/FLUX.1-schnell`         | Fast image generation         |
| Stable Diffusion XL | `nscale:image:stabilityai/stable-diffusion-xl-base-1.0` | High-quality image generation |
| SDXL Lightning      | `nscale:image:ByteDance/SDXL-Lightning`                 | Ultra-fast image generation   |

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
      seed: 42
```

### Supported Parameters

- `temperature`: Controls randomness (0.0 to 2.0). Defaults to `0` unless set.
- `max_tokens`: Maximum number of tokens to generate. Defaults to `1024` unless set.
- `top_p`: Nucleus sampling parameter
- `frequency_penalty`: Reduces repetition based on frequency
- `presence_penalty`: Reduces repetition based on presence
- `stop`: Stop sequences to halt generation
- `seed`: Deterministic sampling seed

Any other parameter is forwarded to the Nscale API unchanged.

:::note

Streaming is not supported. Promptfoo reads each response as a single JSON body, so
setting `stream: true` produces a response it cannot parse.

:::

## Example Configuration

Here's a complete example configuration:

```yaml
providers:
  - id: nscale:openai/gpt-oss-120b
    config:
      temperature: 0.7
      max_tokens: 512
  - id: nscale:meta-llama/Llama-3.3-70B-Instruct
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
