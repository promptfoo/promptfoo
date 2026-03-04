---
title: ModelsLab Provider
description: Generate images with ModelsLab's text-to-image API including Flux, SDXL, and 200+ community models
sidebar_position: 63
keywords: [modelslab, image generation, flux, sdxl, text-to-image, promptfoo provider]
---

# ModelsLab

The `modelslab` provider supports text-to-image generation via the [ModelsLab API](https://docs.modelslab.com), with access to first-party and community models.

## Setup

1. **Create an API key** at [ModelsLab](https://modelslab.com/dashboard/apikeys)

2. **Set the environment variable**:
   ```bash
   export MODELSLAB_API_KEY=your_api_key_here
   ```

## Provider Format

```
modelslab:image:<model_name>
```

### Featured Models

**Text to Image:**

- `modelslab:image:nano-banana-2` - Google Nano Banana 2, fast 1024x1024 generation with natural language editing
- `modelslab:image:seedream-5.0-lite` - Bytedance Seedream 5.0 Lite, fast and lightweight
- `modelslab:image:flux` - Flux, high-quality image generation
- `modelslab:image:sdxl` - Stable Diffusion XL

:::info

Browse the full [model catalog](https://modelslab.com/models) for community fine-tunes and additional models.

:::

## Environment Variables

| Variable            | Description            |
| ------------------- | ---------------------- |
| `MODELSLAB_API_KEY` | Your ModelsLab API key |

## Configuration

### Basic Setup

```yaml
providers:
  - id: modelslab:image:flux
    config:
      width: 1024
      height: 1024
```

### Configuration Options

| Parameter             | Type   | Default | Description                              |
| --------------------- | ------ | ------- | ---------------------------------------- |
| `apiKey`              | string | -       | API key (or use `MODELSLAB_API_KEY` env) |
| `width`               | number | 512     | Image width in pixels                    |
| `height`              | number | 512     | Image height in pixels                   |
| `num_inference_steps` | number | 30      | Number of denoising steps                |
| `guidance_scale`      | number | 7.5     | How closely to follow the prompt         |
| `samples`             | number | 1       | Number of images to generate             |
| `seed`                | number | -       | Random seed for reproducibility          |
| `negative_prompt`     | string | -       | What to avoid in the image               |
| `safety_checker`      | string | `no`    | Enable safety filter (`yes` or `no`)     |
| `enhance_prompt`      | string | `no`    | Auto-enhance the prompt (`yes` or `no`)  |

### Full Example

```yaml
providers:
  - id: modelslab:image:flux
    config:
      width: 1024
      height: 1024
      num_inference_steps: 50
      guidance_scale: 7.5
      negative_prompt: 'blurry, low quality'
      seed: 42

prompts:
  - 'Generate an image of: {{subject}}'

tests:
  - vars:
      subject: 'a mountain landscape at sunset'
```

## Async Generation

ModelsLab uses an async generation pattern. When an image request returns `status: "processing"`, the provider automatically polls the fetch endpoint every 3 seconds until the image is ready (up to 3 minutes).

## Authentication

ModelsLab uses key-in-body authentication. The API key is sent as the `key` field in the JSON request body rather than as a Bearer token header.
