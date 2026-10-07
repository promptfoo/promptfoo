---
sidebar_label: FlexAI
description: Evaluate open-weight chat, reasoning, vision, and embedding models served by FlexAI's OpenAI-compatible inference API, including DeepSeek, Qwen, and GLM
---

# FlexAI

[FlexAI](https://flex.ai) serves open-weight models through an [OpenAI-compatible inference API](https://docs.flex.ai/inference-api/reference/openai-compatibility). The FlexAI provider extends the [OpenAI provider](/docs/providers/openai/), so all of its options are supported.

## Setup

1. Create an API key on the [FlexAI platform](https://platform.flex.ai).
2. Set the `FLEXAI_API_KEY` environment variable or specify `apiKey` in your config.

```yaml
providers:
  - id: flexai:DeepSeek-V4-Flash-0731
```

| Provider ID                | Endpoint                             |
| -------------------------- | ------------------------------------ |
| `flexai:<model>`           | Chat completions                     |
| `flexai:chat:<model>`      | Chat completions (same as above)     |
| `flexai:embedding:<model>` | Embeddings (`embeddings` also works) |

If you omit the model, chat defaults to `DeepSeek-V4-Flash-0731` and embeddings default to `bge-m3`.

The provider sends the key only from `apiKey`, `FLEXAI_API_KEY`, or the variable named by `apiKeyEnvar`. It never falls back to `OPENAI_API_KEY`, and `OPENAI_BASE_URL` / `OPENAI_API_HOST` do not reroute its requests.

## Available Models

Call `GET https://api.flex.ai/v1/models` or see [flex.ai/models](https://flex.ai/models) for the live list. As of October 2026, these chat models are served (context is the served limit; prices are USD per million tokens from the models API; see [pricing](https://flex.ai/pricing) for current rates):

| Model                                   | Context (tokens) | Input / 1M | Output / 1M | Image input | `reasoning_effort` |
| --------------------------------------- | ---------------- | ---------- | ----------- | ----------- | ------------------ |
| `DeepSeek-V4-Flash-0731`                | 1,048,576        | $0.06      | $0.18       |             | Yes                |
| `DeepSeek-V4.1-Flash`                   | 1,048,576        | $0.14      | $0.42       | Yes         | Yes                |
| `gemma-4-26B-A4B-it`                    | 262,144          | $0.06      | $0.33       | Yes         |                    |
| `gemma-4-31b-it`                        | 262,144          | $0.10      | $0.34       | Yes         |                    |
| `GLM-4.5-Air-FP8`                       | 131,072          | $0.14      | $0.86       |             |                    |
| `GLM-5.2`                               | 131,072          | $0.5625    | $1.80       |             | Yes                |
| `GLM-5.3-Flash`                         | 1,048,576        | $0.09      | $0.28       | Yes         | Yes                |
| `gpt-oss-120b`                          | 131,072          | $0.03      | $0.17       |             | Yes                |
| `gpt-oss-20b`                           | 131,072          | $0.02      | $0.10       |             | Yes                |
| `Llama-3.3-70B-Instruct-FP8`            | 131,072          | $0.135     | $0.40       |             |                    |
| `Meta-Llama-3.1-8B-Instruct-FP8`        | 131,072          | $0.02      | $0.05       |             |                    |
| `MiniMax-M2.7`                          | 204,800          | $0.24      | $0.96       |             |                    |
| `Mistral-Nemo-Instruct-2407-FP8`        | 131,072          | $0.019     | $0.03       |             |                    |
| `Muse-Glimmer-30B`                      | 131,072          | $0.30      | $1.20       | Yes         |                    |
| `NVIDIA-Nemotron-3.5-Lightning-30B-A3B` | 1,048,576        | $0.08      | $0.20       |             |                    |
| `Qwen3-30B-A3B-Thinking-2507-FP8`       | 262,144          | $0.20      | $2.40       |             |                    |
| `Qwen3-8B-FP8`                          | 40,960           | $0.117     | $0.455      |             |                    |
| `Qwen3-Coder-30B-A3B-Instruct-FP8`      | 262,144          | $0.07      | $0.26       |             |                    |
| `Qwen3.5-9B`                            | 262,144          | $0.10      | $0.15       | Yes         |                    |
| `Qwen3.6-27B-FP8`                       | 262,144          | $0.39      | $2.34       | Yes         |                    |
| `Qwen3.6-35B-A3B-FP8`                   | 262,144          | $0.10      | $0.90       | Yes         |                    |
| `Qwen3.8-27B`                           | 262,144          | $0.15      | $1.875      | Yes         | Yes                |
| `Qwen3.8-Flash-Next`                    | 262,144          | $0.15      | $0.47       | Yes         | Yes                |
| `Step-3.7-Flash`                        | 262,144          | $0.20      | $1.15       | Yes         | Yes                |

Every chat model in the table supports tool calling. `PaddleOCR-VL` is also served as a document OCR model; it does not support tool calling.

For embeddings, `bge-m3` returns 1024-dimensional vectors and accepts up to 8,192 tokens of input.

## Configuration

The provider accepts every option the [OpenAI provider](/docs/providers/openai/) supports, including `temperature`, `max_tokens`, `top_p`, `stop`, `seed`, `response_format`, and `tools` / `tool_choice`. Model-specific parameters can be sent with `passthrough`.

```yaml
providers:
  - id: flexai:gpt-oss-120b
    config:
      temperature: 0.2
      max_tokens: 2048
      reasoning_effort: low
```

FlexAI-specific behavior:

- **`reasoning_effort`** is forwarded for every FlexAI model. The OpenAI provider only sends it for OpenAI reasoning models, so on the generic `openai` path it is dropped for models such as `DeepSeek-V4-Flash-0731`. FlexAI translates the level per model; the table above shows which models accept it.
- **No default `max_tokens`.** promptfoo normally sends `max_tokens: 1024`. Reasoning tokens count against that limit, so a thinking model can spend it before answering. The FlexAI provider only sends `max_tokens` when you set it (in config, `passthrough`, or `OPENAI_MAX_TOKENS`) and otherwise lets FlexAI apply its server-side default.
- **Reasoning output.** Reasoning models return `reasoning_content`, which promptfoo adds to the output with a `Thinking: …` prefix. Set `showThinking: false` when you assert on the answer alone.

### Unsupported parameters

FlexAI returns a `400` for `n` greater than 1, for `verbosity`, and for `dimensions` on embeddings. Support for `logit_bias` depends on the model.

### Cost

The provider has no built-in price table. To track cost, set `inputCost` and `outputCost` (or a flat `cost`) in USD per token, that is, the per-million price divided by 1,000,000:

```yaml
providers:
  - id: flexai:DeepSeek-V4-Flash-0731
    config:
      inputCost: 0.00000006 # $0.06 per 1M input tokens
      outputCost: 0.00000018 # $0.18 per 1M output tokens
```

## Embeddings

Use a FlexAI embedding model for similarity assertions:

```yaml
defaultTest:
  options:
    provider:
      embedding:
        id: flexai:embedding:bge-m3
```

## Example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: FlexAI chat models
prompts:
  - 'Answer in one short sentence: {{question}}'
providers:
  - id: flexai:DeepSeek-V4-Flash-0731
  - id: flexai:gpt-oss-120b
    config:
      reasoning_effort: low
      showThinking: false
tests:
  - vars:
      question: What is the capital of France?
    assert:
      - type: icontains
        value: Paris
```

A runnable example lives in [examples/provider-flexai](https://github.com/promptfoo/promptfoo/tree/main/examples/provider-flexai).

## Data Handling

FlexAI's [privacy policy](https://flex.ai/privacy-policy) states that it does not retain prompt or output data for AI processing other than video generation, and that it does not use prompts to train the models it serves. See also the [terms of service](https://flex.ai/terms-of-service).

## See Also

- [OpenAI Provider](/docs/providers/openai/) for shared configuration options
- [FlexAI quickstart](https://docs.flex.ai/inference-api/quickstart) and [OpenAI compatibility reference](https://docs.flex.ai/inference-api/reference/openai-compatibility)
