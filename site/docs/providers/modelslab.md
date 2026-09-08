---
title: ModelsLab Provider
description: Generate images with ModelsLab's v6 text-to-image API using exact IDs for Flux, SDXL, and Seedream, with API key configuration and automatic async polling.
sidebar_position: 63
keywords: [modelslab, image generation, flux, sdxl, text-to-image, promptfoo provider]
---

# ModelsLab

The `modelslab` provider supports text-to-image generation through ModelsLab's [v6 image API](https://docs.modelslab.com/quickstart), using `/api/v6/images/text2img`. The model name is sent unchanged as `model_id`, so use an exact ModelsLab ID supported by that endpoint.

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

- `modelslab:image:seedream-5-lite-t2i` - ByteDance Seedream 5 Lite, documented in ModelsLab's [v6 integration guide](https://modelslab.com/blog/image-generation/seedream-5-0-api-bytedance-image-model-modelslab-2026)
- `modelslab:image:flux` - Flux, high-quality image generation
- `modelslab:image:sdxl` - Stable Diffusion XL

:::info

Browse the [model catalog](https://modelslab.com/models) and check each model's API version. For example, [Nano Banana 2](https://modelslab.com/models/google/gemini-3.1-t2i) uses `gemini-3.1-t2i` in a v7 example; that does not establish support through this v6 provider.

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
