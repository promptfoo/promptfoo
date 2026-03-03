# huggingface-chat (HuggingFace Chat Completions)

This example demonstrates how to use HuggingFace's OpenAI-compatible chat completions API with promptfoo.

## Setup

Set your HuggingFace token:

```bash
export HF_TOKEN=your_huggingface_token
```

Get your token from [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens). HuggingFace's router may incur usage costs depending on your plan and the model used.

## Usage

```bash
npx promptfoo@latest init --example huggingface-chat
npx promptfoo@latest eval
```

## Provider format

Use the `huggingface:chat` provider format:

```yaml
providers:
  - id: huggingface:chat:meta-llama/Llama-3.3-70B-Instruct
    config:
      temperature: 0.1
      max_new_tokens: 100
```

## Supported models

Any model available on HuggingFace's [Inference Providers](https://huggingface.co/docs/inference-providers/tasks/chat-completion) that supports chat completions:

- `deepseek-ai/DeepSeek-R1`
- `openai/gpt-oss-120b`
- `zai-org/GLM-4.5`
- `Qwen/Qwen2.5-Coder-32B-Instruct`
- `meta-llama/Llama-3.3-70B-Instruct`
- `google/gemma-3-27b-it`
- And many more...

Browse models at [huggingface.co/models?other=conversational](https://huggingface.co/models?other=conversational).

## Inference Provider routing

Some models require routing to a specific [Inference Provider](https://huggingface.co/docs/inference-providers). Use a `:provider` suffix or the `inferenceProvider` config option:

```yaml
providers:
  # Provider suffix
  - id: huggingface:chat:Qwen/QwQ-32B:featherless-ai

  # Or config option
  - id: huggingface:chat:Qwen/QwQ-32B
    config:
      inferenceProvider: featherless-ai
```

## Configuration options

| Parameter           | Description                            |
| ------------------- | -------------------------------------- |
| `temperature`       | Controls randomness (0.0-2.0)          |
| `max_new_tokens`    | Maximum tokens to generate             |
| `top_p`             | Nucleus sampling parameter             |
| `inferenceProvider` | Route to a specific Inference Provider |
| `apiKey`            | HuggingFace token (or use env)         |
| `apiBaseUrl`        | Custom API endpoint (optional)         |

See [HuggingFace provider docs](/docs/providers/huggingface) for full configuration options.
