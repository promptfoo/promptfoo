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
  - id: huggingface:chat:deepseek-ai/DeepSeek-R1
    config:
      temperature: 0.1
      max_new_tokens: 100
```

## Supported models

Any model available on HuggingFace's router that supports chat completions:

- `deepseek-ai/DeepSeek-R1`
- `meta-llama/Llama-3.3-70B-Instruct`
- `Qwen/Qwen2.5-72B-Instruct`
- And many more...

Browse models at [huggingface.co/models?other=conversational](https://huggingface.co/models?other=conversational).

## Configuration options

| Parameter        | Description                    |
| ---------------- | ------------------------------ |
| `temperature`    | Controls randomness (0.0-2.0)  |
| `max_new_tokens` | Maximum tokens to generate     |
| `top_p`          | Nucleus sampling parameter     |
| `apiKey`         | HuggingFace token (or use env) |
| `apiBaseUrl`     | Custom API endpoint (optional) |

See [HuggingFace provider docs](/docs/providers/huggingface) for full configuration options.
