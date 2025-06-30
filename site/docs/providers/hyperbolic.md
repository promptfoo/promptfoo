---
sidebar_position: 42
---

# Hyperbolic

The `hyperbolic` provider supports [Hyperbolic's API](https://docs.hyperbolic.xyz), which provides access to various LLM, image generation, audio generation, and vision-language models through an [OpenAI-compatible API format](/docs/providers/openai). This makes it easy to integrate into existing applications that use the OpenAI SDK.

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
hyperbolic:audio:<model_name>
```

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

- `hyperbolic:audio:Melo-TTS` - Natural narrator for high-quality speech

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

| Parameter            | Description                                                               |
| -------------------- | ------------------------------------------------------------------------- |
| `apiKey`             | Your Hyperbolic API key                                                   |
| `temperature`        | Controls the randomness of the output (0.0 to 2.0)                        |
| `max_tokens`         | The maximum number of tokens to generate                                  |
| `top_p`              | Controls nucleus sampling (0.0 to 1.0)                                    |
| `top_k`              | Controls the number of top tokens to consider (-1 to consider all tokens) |
| `min_p`              | Minimum probability for a token to be considered (0.0 to 1.0)             |
| `presence_penalty`   | Penalty for new tokens (0.0 to 1.0)                                       |
| `frequency_penalty`  | Penalty for frequent tokens (0.0 to 1.0)                                  |
| `repetition_penalty` | Prevents token repetition (default: 1.0)                                  |
| `stop`               | Array of strings that will stop generation when encountered               |
| `seed`               | Random seed for reproducible results                                      |

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

| Parameter  | Description             |
| ---------- | ----------------------- |
| `voice`    | Voice selection for TTS |
| `speed`    | Speech speed multiplier |
| `language` | Language for TTS        |

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
  - id: hyperbolic:audio:Melo-TTS
    config:
      voice: 'alloy'
      speed: 1.0

tests:
  - assert:
      - type: is-valid-audio
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

Hyperbolic offers competitive pricing across all model types (rates as of January 2025):

### Text Models

- **DeepSeek-R1**: $2.00/M tokens
- **DeepSeek-V3**: $0.25/M tokens
- **Qwen3-235B**: $0.40/M tokens
- **Llama-3.1-405B**: $4.00/M tokens (BF16)
- **Llama-3.1-70B**: $0.40/M tokens
- **Llama-3.1-8B**: $0.10/M tokens

### Image Models

- **Flux.1-dev**: $0.01 per 1024x1024 image with 25 steps (scales with size/steps)
- **SDXL models**: Similar pricing formula
- **SD1.5/SD2**: Lower cost options

### Audio Models

- **Melo-TTS**: $5.00 per 1M characters

## Getting Started

Test your setup with working examples:

```bash
npx promptfoo@latest init --example hyperbolic
```

This includes tested configurations for text generation, image creation, audio synthesis, and vision tasks.

## Notes

- **Model availability varies** - Some models require Pro tier access ($5+ deposit)
- **Rate limits**: Basic tier: 60 requests/minute (free), Pro tier: 600 requests/minute
- **Recommended models**: Use `meta-llama/Llama-3.3-70B-Instruct` for text, `SDXL1.0-base` for images
- All endpoints use OpenAI-compatible format for easy integration
- VLM models support multimodal inputs (text + images)
