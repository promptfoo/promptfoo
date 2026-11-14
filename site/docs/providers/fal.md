---
title: fal.ai Provider
description: Integrate fal.ai's fast image generation models including Flux and Stable Diffusion for visual AI testing and evaluation
sidebar_position: 42
keywords: [fal.ai, image generation, AI images, flux, imagen, ideogram, promptfoo provider]
---

# fal.ai

The `fal` provider calls the [fal.ai](https://fal.ai) inference API through the
[fal-js](https://github.com/fal-ai/fal-js) client.

## Setup

1. **Install the fal client**:

   ```bash
   npm install --save @fal-ai/client
   ```

2. **Create an API key** in the [fal dashboard](https://fal.ai/dashboard/keys)

3. **Set the environment variable**:
   ```bash
   export FAL_KEY=your_api_key_here
   ```

## Provider Format

To run a model, specify the model type and model name: `fal:<model_type>:<model_name>`.

### Featured Models

- `fal:image:fal-ai/flux-pro/v1.1-ultra` - Image generation with up to 2K resolution
- `fal:image:fal-ai/flux/schnell` - Image generation in 1-4 steps
- `fal:image:fal-ai/fast-sdxl` - High-speed SDXL with LoRA support

:::info

See the [model gallery](https://fal.ai/models) for available models and their input fields.

:::

## Popular Models

- **For speed**: `fal:image:fal-ai/flux/schnell` - Generation in 1-4 steps
- **For quality**: `fal:image:fal-ai/flux/dev` - 12B parameter model
- **For text/logos**: `fal:image:fal-ai/ideogram/v3` - Text and logo generation
- **For professional work**: `fal:image:fal-ai/flux-pro/v1.1-ultra` - Up to 2K resolution
- **For vector art**: `fal:image:fal-ai/recraft/v3/text-to-image` - Vector art and typography
- **For 4K images**: `fal:image:fal-ai/sana` - 4K generation
- **For multimodal**: `fal:image:fal-ai/bagel` - 7B parameter text and image model

Browse all models at [fal.ai/models](https://fal.ai/models?categories=text-to-image).

## Environment Variables

| Variable  | Description                              |
| --------- | ---------------------------------------- |
| `FAL_KEY` | Your API key for authentication with fal |

## Client Options

Provider config values are sent to the fal model as input, except for `apiKey` and the optional `client` block. Use `client` for options that should be passed to the underlying `@fal-ai/client` SDK instead of the model endpoint.

For example, `@fal-ai/client` proxy URLs are browser-only when passed as a string. To route promptfoo's Node.js CLI requests through a proxy, use the object form and set `when: always`:

```yaml
providers:
  - id: fal:image:fal-ai/flux/schnell
    config:
      client:
        proxyUrl:
          url: http://localhost:8787/api/fal/proxy
          when: always
```

## Configuration

Configure the fal provider in your promptfoo configuration file. Here's an example using [`fal-ai/flux/schnell`](https://fal.ai/models/fal-ai/flux/schnell):

:::info

Configuration parameters vary by model. For example, `fast-sdxl` supports additional parameters like `scheduler` and `guidance_scale`. Always check the [model-specific documentation](https://fal.ai/models) for supported parameters.

:::

### Basic Setup

```yaml
providers:
  - id: fal:image:fal-ai/flux/schnell
    config:
      apiKey: your_api_key_here # Alternative to FAL_KEY environment variable
      image_size:
        width: 1024
        height: 1024
      num_inference_steps: 4
      seed: 6252023
```

### Advanced Options

```yaml
providers:
  - id: fal:image:fal-ai/flux/dev
    config:
      num_inference_steps: 28
      guidance_scale: 7.5
      seed: 42
      image_size:
        width: 1024
        height: 1024
```

### Configuration Options

| Parameter             | Type             | Description                             | Example             |
| --------------------- | ---------------- | --------------------------------------- | ------------------- |
| `apiKey`              | string           | The API key for authentication with fal | `your_api_key_here` |
| `client.proxyUrl`     | string or object | fal SDK proxy URL configuration         | `{ url, when }`     |
| `image_size.width`    | number           | The width of the generated image        | `1024`              |
| `image_size.height`   | number           | The height of the generated image       | `1024`              |
| `num_inference_steps` | number           | The number of inference steps to run    | `4` to `50`         |
| `seed`                | number           | Sets a seed for reproducible results    | `42`                |
| `guidance_scale`      | number           | Prompt adherence (model-dependent)      | `3.5` to `15`       |

## See Also

- [Model gallery](https://fal.ai/models)
- [API documentation](https://docs.fal.ai/)
- [fal.ai Discord community](https://discord.gg/fal-ai)
- [Configuration Reference](../configuration/reference.md)
