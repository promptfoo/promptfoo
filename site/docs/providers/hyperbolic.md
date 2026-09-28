---
title: Hyperbolic
sidebar_position: 42
description: Configure Hyperbolic's OpenAI-compatible API to access DeepSeek, Qwen, and other specialized LLMs for text, image, and audio generation through a unified endpoint
---

# Hyperbolic

The `hyperbolic` provider calls [Hyperbolic](https://docs.hyperbolic.xyz) text and vision models through its [OpenAI-compatible chat API](/docs/providers/openai). It uses Hyperbolic's native endpoints for image and audio generation.

## Setup

To use Hyperbolic, you need to set the `HYPERBOLIC_API_KEY` environment variable or specify the `apiKey` in the provider configuration.

Example of setting the environment variable:

```sh
export HYPERBOLIC_API_KEY=your_api_key_here
```

## Provider Formats

### Text Generation (LLM)

```
hyperbolic:<model_name>
```

### Image Generation

```
hyperbolic:image:<model_name>
```

### Audio Generation (TTS)

```
hyperbolic:audio
```

This calls Hyperbolic's fixed Melo TTS endpoint. The local provider identity defaults to `hyperbolic:audio:Melo-TTS`. An optional suffix is retained for compatibility and does not select a different remote model.

## Available Models

### Text Models (LLMs)

#### DeepSeek Models

- `hyperbolic:deepseek-ai/DeepSeek-R1` - Best open-source reasoning model
- `hyperbolic:deepseek-ai/DeepSeek-R1-Zero` - Zero-shot variant of DeepSeek-R1
- `hyperbolic:deepseek-ai/DeepSeek-V3` - Latest DeepSeek model
- `hyperbolic:deepseek/DeepSeek-V2.5` - Previous generation model

#### Qwen Models

- `hyperbolic:qwen/Qwen3-235B-A22B` - MoE model with strong reasoning ability
- `hyperbolic:qwen/QwQ-32B` - Latest Qwen reasoning model
- `hyperbolic:qwen/QwQ-32B-Preview` - Preview version of QwQ
- `hyperbolic:qwen/Qwen2.5-72B-Instruct` - Latest Qwen LLM with coding and math
- `hyperbolic:qwen/Qwen2.5-Coder-32B` - Best coder from Qwen Team

#### Meta Llama Models

- `hyperbolic:meta-llama/Llama-3.3-70B-Instruct` - Performance comparable to Llama 3.1 405B
- `hyperbolic:meta-llama/Llama-3.2-3B` - Latest small Llama model
- `hyperbolic:meta-llama/Llama-3.1-405B` - Biggest and best open-source model
- `hyperbolic:meta-llama/Llama-3.1-405B-BASE` - Base completion model (BF16)
- `hyperbolic:meta-llama/Llama-3.1-70B` - Best LLM at its size
- `hyperbolic:meta-llama/Llama-3.1-8B` - Smallest and fastest Llama 3.1
- `hyperbolic:meta-llama/Llama-3-70B` - Highly efficient and powerful

#### Other Models

- `hyperbolic:hermes/Hermes-3-70B` - Latest flagship Hermes model

### Vision-Language Models (VLMs)

- `hyperbolic:qwen/Qwen2.5-VL-72B-Instruct` - Latest and biggest vision model from Qwen
- `hyperbolic:qwen/Qwen2.5-VL-7B-Instruct` - Smaller vision model from Qwen
- `hyperbolic:mistralai/Pixtral-12B` - Vision model from MistralAI

### Image Generation Models

- `hyperbolic:image:SDXL1.0-base` - High-resolution master (recommended)
- `hyperbolic:image:SD1.5` - Reliable classic Stable Diffusion
- `hyperbolic:image:SD2` - Enhanced Stable Diffusion v2
- `hyperbolic:image:SSD` - Segmind SD-1B for domain-specific tasks
- `hyperbolic:image:SDXL-turbo` - Speedy high-resolution outputs
- `hyperbolic:image:SDXL-ControlNet` - SDXL with ControlNet
- `hyperbolic:image:SD1.5-ControlNet` - SD1.5 with ControlNet

### Audio Generation Models

- `hyperbolic:audio` - Melo TTS text-to-speech endpoint

Hyperbolic has announced an [upcoming Melo TTS sunset](https://www.hyperbolic.ai/docs/inference/audio-apis) without a removal date. The existing `hyperbolic:audio:Melo-TTS` route remains compatible.

## Configuration

Configure the provider in your promptfoo configuration file:

```yaml
providers:
  - id: hyperbolic:deepseek-ai/DeepSeek-R1
    config:
      temperature: 0.1
      top_p: 0.9
      apiKey: ... # override the environment variable
```

### Configuration Options

#### Text Generation Options

| Parameter                         | Description                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `apiKey`                          | Your Hyperbolic API key                                                                                                              |
| `cost`, `inputCost`, `outputCost` | Override promptfoo's pricing estimates. Use `inputCost` and `outputCost` for asymmetric pricing; `cost` remains the shared fallback. |
| `temperature`                     | Controls the randomness of the output (0.0 to 2.0)                                                                                   |
| `max_tokens`                      | The maximum number of tokens to generate                                                                                             |
| `top_p`                           | Controls nucleus sampling (0.0 to 1.0)                                                                                               |
| `top_k`                           | Controls the number of top tokens to consider (-1 to consider all tokens)                                                            |
| `min_p`                           | Minimum probability for a token to be considered (0.0 to 1.0)                                                                        |
| `presence_penalty`                | Penalty for new tokens (0.0 to 1.0)                                                                                                  |
| `frequency_penalty`               | Penalty for frequent tokens (0.0 to 1.0)                                                                                             |
| `repetition_penalty`              | Prevents token repetition (default: 1.0)                                                                                             |
| `stop`                            | Array of strings that will stop generation when encountered                                                                          |
| `seed`                            | Random seed for reproducible results                                                                                                 |

#### Image Generation Options

| Parameter          | Description                                         |
| ------------------ | --------------------------------------------------- |
| `height`           | Height of the image (default: 1024)                 |
| `width`            | Width of the image (default: 1024)                  |
| `backend`          | Computational backend: 'auto', 'tvm', or 'torch'    |
| `negative_prompt`  | Text specifying what not to generate                |
| `seed`             | Random seed for reproducible results                |
| `cfg_scale`        | Guidance scale (higher = more relevant to prompt)   |
| `steps`            | Number of denoising steps                           |
| `style_preset`     | Style guide for the image                           |
| `enable_refiner`   | Enable SDXL refiner (SDXL only)                     |
| `controlnet_name`  | ControlNet model name                               |
| `controlnet_image` | Reference image for ControlNet                      |
| `loras`            | LoRA weights as object (e.g., `{"Pixel_Art": 0.7}`) |

#### Audio Generation Options

| Parameter       | Description                                                              |
| --------------- | ------------------------------------------------------------------------ |
| `language`      | Language code (default: `EN`)                                            |
| `speaker`       | Language-specific speaker, such as `EN-US`, `EN-BR`, `EN-INDIA`, `EN-AU` |
| `speed`         | Speech speed multiplier (0.1–5, default: 1)                              |
| `sdp_ratio`     | Prosody variation (0–1)                                                  |
| `noise_scale`   | Speech variation (0–1)                                                   |
| `noise_scale_w` | Timing variation (0–1)                                                   |

The prompt supplies the required `text` field. Prompt-level configuration overrides these provider options. The [native audio API](https://www.hyperbolic.ai/docs/inference/audio-apis) returns base64-encoded MP3 audio and does not document `model` or `voice` parameters. The provider omits `config.model` and `config.voice` for the native endpoint and forwards them only to custom endpoints. Use `speaker` for native voice selection; changing the route suffix never adds a `model` field.

For a custom audio endpoint, set `apiBaseUrl` to its base URL, including any version prefix and omitting the trailing slash. The provider appends `/audio/generation`. Custom endpoints retain the legacy WAV output metadata and $0.001 per 1,000-character estimate; these defaults do not establish the custom service's format or pricing.

## Example Usage

### Text Generation Example

```yaml
prompts:
  - file://prompts/coding_assistant.json
providers:
  - id: hyperbolic:qwen/Qwen2.5-Coder-32B
    config:
      temperature: 0.1
      max_tokens: 4096
      presence_penalty: 0.1
      seed: 42

tests:
  - vars:
      task: 'Write a Python function to find the longest common subsequence of two strings'
    assert:
      - type: contains
        value: 'def lcs'
      - type: contains
        value: 'dynamic programming'
```

### Image Generation Example

```yaml
prompts:
  - 'A futuristic city skyline at sunset with flying cars'
providers:
  - id: hyperbolic:image:SDXL1.0-base
    config:
      width: 1024
      height: 1024
      cfg_scale: 7.0
      steps: 30
      negative_prompt: 'blurry, low quality'

tests:
  - assert:
      - type: is-valid-image
      - type: image-width
        value: 1920
```

### Audio Generation Example

```yaml
prompts:
  - 'Welcome to Hyperbolic AI. We are excited to help you build amazing applications.'
providers:
  - id: hyperbolic:audio
    config:
      language: 'EN'
      speaker: 'EN-US'
      speed: 1.0

tests:
  - assert:
      - type: javascript
        value: "typeof output === 'string' && output.length > 0"
```

### Vision-Language Model Example

```yaml
prompts:
  - role: user
    content:
      - type: text
        text: "What's in this image?"
      - type: image_url
        image_url:
          url: 'https://example.com/image.jpg'
providers:
  - id: hyperbolic:qwen/Qwen2.5-VL-72B-Instruct
    config:
      temperature: 0.1
      max_tokens: 1024

tests:
  - assert:
      - type: contains
        value: 'image shows'
```

Example prompt template (`prompts/coding_assistant.json`):

```json
[
  {
    "role": "system",
    "content": "You are an expert programming assistant."
  },
  {
    "role": "user",
    "content": "{{task}}"
  }
]
```

## Cost Information

Promptfoo estimates costs from token usage for text, per request for images, and per input character for Melo TTS. Confirm current inference rates with [Hyperbolic](https://docs.hyperbolic.ai/docs/general/support). You can override the text rates:

```yaml
providers:
  - id: hyperbolic:deepseek-ai/DeepSeek-R1
    config:
      inputCost: 0.0000005 # Example: $0.50 per million input tokens
      outputCost: 0.00000218 # Example: $2.18 per million output tokens
```

`inputCost` and `outputCost` are in USD per token and take precedence over the shared `cost`
fallback.

### Text Models

Text estimates use separate input and output token rates.

### Image Models

Promptfoo uses a fixed estimate for each image model. It does not adjust for resolution or step count, and `config.cost` does not override it.

### Audio Models

Promptfoo estimates costs per character of input text for the native Melo TTS endpoint. Hyperbolic's [audio documentation](https://www.hyperbolic.ai/docs/inference/audio-apis#pricing) lists pricing and says that Melo TTS will be discontinued.

## Getting Started

Test your setup with working examples:

```bash
npx promptfoo@latest init --example provider-hyperbolic
```

This includes tested configurations for text generation, image creation, audio synthesis, and vision tasks.

## Notes

- Check [Hyperbolic's documentation](https://docs.hyperbolic.xyz) for model availability and rate limits for your account tier.
- Chat uses the OpenAI format; image and audio use Hyperbolic's native endpoints.
- Vision models accept text and images.
