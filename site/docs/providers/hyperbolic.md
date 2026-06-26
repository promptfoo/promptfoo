---
sidebar_position: 42
description: Configure Hyperbolic's OpenAI-compatible API to access DeepSeek, Qwen, and other specialized LLMs for text, image, and audio generation through a unified endpoint
---

# Hyperbolic

The `hyperbolic` provider supports [Hyperbolic's API](https://docs.hyperbolic.xyz), which provides access to various LLM, image generation, audio generation, and vision-language models through an [OpenAI-compatible API format](/docs/providers/openai). This lets you integrate into existing applications that use the OpenAI SDK.

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

Hyperbolic changes its hosted catalog over time. Check the
[supported models page](https://docs.hyperbolic.xyz/docs/supported-models) before copying an ID.
The examples later on this page use model IDs listed there at the time of this audit.

### Text Models (LLMs)

#### DeepSeek Models

Use the supported models page to find currently hosted DeepSeek IDs.

#### Qwen Models

- `hyperbolic:qwen/Qwen2.5-Coder-32B` - Text and code generation

#### Meta Llama Models

Use the supported models page to find currently hosted Llama IDs.

#### Other Models

Use the supported models page to find other hosted text models.

### Vision-Language Models (VLMs)

- `hyperbolic:qwen/Qwen2.5-VL-72B-Instruct` - Vision-language model

### Image Generation Models

- `hyperbolic:image:SDXL1.0-base` - Image generation

### Audio Generation Models

- `hyperbolic:audio:Melo-TTS` - Text-to-speech model

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

| Parameter  | Description             |
| ---------- | ----------------------- |
| `voice`    | Voice selection for TTS |
| `speed`    | Speech speed multiplier |
| `language` | Language for TTS        |

## Example Usage

### Text Generation Example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
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

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
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
      - type: javascript
        value: output.startsWith('data:image/')
```

### Audio Generation Example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - 'Welcome to Hyperbolic AI. We are excited to help you build amazing applications.'
providers:
  - id: hyperbolic:audio:Melo-TTS
    config:
      voice: 'alloy'
      speed: 1.0

tests:
  - assert:
      - type: javascript
        value: context.providerResponse?.audio?.format === 'wav'
```

### Vision-Language Model Example

```yaml
prompts:
  - |
    [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "What's in this image?"
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "https://example.com/image.jpg"
            }
          }
        ]
      }
    ]
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

Pricing changes independently of promptfoo. Check Hyperbolic's current model catalog before
adding cost assertions.

### Text Models

See the supported models page for current text-model pricing.

### Image Models

See the supported models page for current image-model pricing.

### Audio Models

See the supported models page for current audio-model pricing.

## Getting Started

Test your setup with working examples:

```bash
npx promptfoo@latest init --example provider-hyperbolic
```

This includes tested configurations for text generation, image creation, audio synthesis, and vision tasks.

## Notes

- **Model availability varies** - Check the supported models page for current access requirements
- All endpoints use OpenAI-compatible format for easy integration
- VLM models support multimodal inputs (text + images)
