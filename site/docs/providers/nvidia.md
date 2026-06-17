---
title: NVIDIA NIM
sidebar_position: 58
description: Use NVIDIA NIM hosted inference APIs with promptfoo to evaluate Llama, Qwen, Nemotron, DeepSeek, and Mistral chat models through OpenAI-compatible endpoints.
---

# NVIDIA NIM

The NVIDIA provider connects promptfoo to [NVIDIA's hosted inference API](https://build.nvidia.com) at `https://integrate.api.nvidia.com/v1`. The endpoint is OpenAI-compatible, so any model NVIDIA exposes through it can be used the same way you'd use OpenAI Chat Completions.

## Setup

Set your API key as an environment variable:

```bash
export NVIDIA_API_KEY=your_api_key_here
```

Or add it to your `.env` file:

```env
NVIDIA_API_KEY=your_api_key_here
```

### Getting an API key

1. Sign in at [build.nvidia.com](https://build.nvidia.com) (free developer account).
2. Open any model card (for example, [Llama 3.3 70B Instruct](https://build.nvidia.com/meta/llama-3_3-70b-instruct)).
3. Click **Get API Key**. The key starts with `nvapi-`.

NVIDIA's developer program grants a recurring allowance of free request credits per account, which is usually enough for prompt iteration and small evals before any paid usage is needed. Credit limits and pricing are documented at [build.nvidia.com](https://build.nvidia.com); check there for what is in effect rather than assuming the value listed in any blog post.

## Configuration

Use the `nvidia:` prefix followed by the full model id as listed on the model card:

```yaml
providers:
  - nvidia:meta/llama-3.3-70b-instruct
  - nvidia:qwen/qwen2.5-coder-32b-instruct
  - nvidia:nvidia/llama-3.1-nemotron-70b-instruct
```

Standard OpenAI-compatible parameters are passed through:

```yaml
providers:
  - id: nvidia:meta/llama-3.3-70b-instruct
    config:
      temperature: 0.7
      max_tokens: 1024
      top_p: 0.9
      stop: ['END']
```

To override the base URL (for example, when routing through a corporate proxy or to a self-hosted NIM):

```yaml
providers:
  - id: nvidia:meta/llama-3.3-70b-instruct
    config:
      apiBaseUrl: https://your-proxy.example.com/nvidia/v1
      apiKeyEnvar: CUSTOM_NVIDIA_KEY
```

## A few common models

The full list is on [build.nvidia.com](https://build.nvidia.com). Some commonly used ids:

| Model                           | Provider format                                 |
| ------------------------------- | ----------------------------------------------- |
| Llama 3.3 70B Instruct          | `nvidia:meta/llama-3.3-70b-instruct`            |
| Llama 3.1 405B Instruct         | `nvidia:meta/llama-3.1-405b-instruct`           |
| Llama 3.2 90B Vision Instruct   | `nvidia:meta/llama-3.2-90b-vision-instruct`     |
| Llama 3.1 Nemotron 70B Instruct | `nvidia:nvidia/llama-3.1-nemotron-70b-instruct` |
| Mistral Large 2 Instruct        | `nvidia:mistralai/mistral-large-2-instruct`     |
| Mixtral 8x22B Instruct          | `nvidia:mistralai/mixtral-8x22b-instruct-v0.1`  |
| Qwen 2.5 Coder 32B Instruct     | `nvidia:qwen/qwen2.5-coder-32b-instruct`        |
| DeepSeek R1                     | `nvidia:deepseek-ai/deepseek-r1`                |

## Example

A minimal eval comparing two NIM-hosted models. Uses deterministic assertions so the example runs end-to-end with only `NVIDIA_API_KEY` configured — `llm-rubric` would otherwise fall back to promptfoo's default OpenAI grader and require a separate `OPENAI_API_KEY`.

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - id: nvidia:meta/llama-3.3-70b-instruct
    config:
      temperature: 0.2
      max_tokens: 256
  - id: nvidia:nvidia/llama-3.1-nemotron-70b-instruct
    config:
      temperature: 0.2
      max_tokens: 256

prompts:
  - 'Summarise the following in one sentence: {{passage}}'

tests:
  - vars:
      passage: 'Photosynthesis is the process by which plants convert light energy into chemical energy stored in glucose.'
    assert:
      - type: icontains
        value: plants
      - type: icontains-any
        value: [light, energy, glucose]
```

If you want a model-graded assertion, point `llm-rubric` at a NIM-hosted grader so the example stays self-contained:

```yaml
defaultTest:
  options:
    provider: nvidia:meta/llama-3.3-70b-instruct
```

## Notes

- Cost calculation is not built in for NVIDIA models. NIM bills against credits rather than per-token public price lists for many models, and the actual cost depends on your account tier. Set both `inputCost` and `outputCost` on the provider config if you want to record an estimate in eval output.
- Tool calling and JSON-mode responses follow the same configuration as the [OpenAI provider](./openai.md) because the API surface is OpenAI-compatible. Streaming responses are not implemented by this provider.
- This provider supports NIM chat-completion models. Retrieval, embedding, reranking, and other NIM APIs require a provider that targets their corresponding endpoint.
