---
sidebar_position: 42
description: Configure Hyperbolic's OpenAI-compatible API to access DeepSeek, Qwen, and other specialized LLMs for text, image, and audio generation through a unified endpoint
---

# Hyperbolic

The `hyperbolic` provider supports [Hyperbolic's serverless inference API](https://docs.hyperbolic.ai/inference/overview), which provides text, image, audio, and vision-language models through an [OpenAI-compatible API format](/docs/providers/openai).

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

Hyperbolic changes its hosted catalog over time. Check the current
[text model catalog](https://docs.hyperbolic.ai/inference/text-apis) and the model list available
to your account before copying an ID. The text example on this page uses an ID in that catalog.

### Text Models (LLMs)

#### DeepSeek Models

- `hyperbolic:deepseek-ai/DeepSeek-R1` - Reasoning and text generation

#### Qwen Models

Use the text model catalog and your account's model list to choose a current Qwen ID.

#### Meta Llama Models

- `hyperbolic:meta-llama/Llama-3.3-70B-Instruct` - General text generation

#### Other Models

Use the text model catalog to find other currently hosted IDs.

### Vision-Language Models (VLMs)

Confirm a current multimodal ID in your account's model list before configuring a VLM.

### Image Generation Models

Choose a current model ID from Hyperbolic's [image API documentation](https://docs.hyperbolic.ai/inference/image-apis).

### Audio Generation Models

- `hyperbolic:audio` - Melo TTS text-to-speech endpoint

Hyperbolic has announced an [upcoming Melo TTS sunset](https://www.hyperbolic.ai/docs/inference/audio-apis) without a removal date. The existing `hyperbolic:audio:Melo-TTS` route remains compatible.

## Configuration

Configure the provider in your Promptfoo configuration file:

```yaml
providers:
  - id: hyperbolic:meta-llama/Llama-3.3-70B-Instruct
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
| `cost`, `inputCost`, `outputCost` | Override Promptfoo's pricing estimates. Use `inputCost` and `outputCost` for asymmetric pricing; `cost` remains the shared fallback. |
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

The prompt supplies the required `text` field. Prompt-level configuration overrides these provider options. The [native audio API](https://www.hyperbolic.ai/docs/inference/audio-apis) returns base64-encoded MP3 audio and does not document `model` or `voice` parameters. Existing explicit `config.model` and `config.voice` values are still forwarded for compatibility with custom endpoints; changing the route suffix never adds a `model` field.

For a custom audio endpoint, set `apiBaseUrl` to its base URL, including any version prefix and omitting the trailing slash. The provider appends `/audio/generation`. Custom endpoints retain the legacy WAV output metadata and $0.001 per 1,000-character estimate; these defaults do not establish the custom service's format or pricing.

## Example Usage

### Text Generation Example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - file://prompts/coding_assistant.json
providers:
  - id: hyperbolic:meta-llama/Llama-3.3-70B-Instruct
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

Choose an ID from the current image API documentation, then use the
`hyperbolic:image:<model_name>` provider format. Media model availability changes too frequently to
pin a complete image config here.

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
        value: typeof output === 'string' && output.length > 0
```

### Vision-Language Model Example

Choose a current multimodal ID from your account's model list and use it with the
`hyperbolic:<model_name>` provider format.

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

Pricing changes independently of Promptfoo. Check Hyperbolic's current API documentation before
adding cost assertions.

### Text Models

See the [text model catalog](https://docs.hyperbolic.ai/inference/text-apis) for current pricing.

### Image Models

See the [image API documentation](https://docs.hyperbolic.ai/inference/image-apis) for current pricing.

### Audio Models

- **Melo TTS**: promptfoo estimates $5.00 per 1M characters for Hyperbolic's native endpoint, following its [audio pricing documentation](https://www.hyperbolic.ai/docs/inference/audio-apis#pricing).

## Getting Started

Start with the complete text config and companion prompt template above. Before running it, confirm
that the model ID appears in your account's model list and set `HYPERBOLIC_API_KEY`.

## Notes

- **Model availability varies** - Check Hyperbolic's current API documentation and your account's model list
- All endpoints use OpenAI-compatible format for easy integration
- VLM models support multimodal inputs (text + images)
