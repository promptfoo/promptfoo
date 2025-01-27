---
sidebar_position: 42
---

# fal.ai

The `fal` provider supports the [fal.ai](https://fal.ai) inference API using the [fal-js](https://github.com/fal-ai/fal-js) client, providing a native experience for using fal.ai models in your evaluations.

## Setup

1. Install the fal client as a dependency:

   ```sh
   npm install -g @fal-ai/serverless-client
   ```

2. Create an API key in the [fal dashboard](https://fal.ai/dashboard/keys).
3. Set the `FAL_KEY` environment variable:

   ```sh
   export FAL_KEY=your_api_key_here
   ```

## Provider Format

To run a model, specify the model type and model name: `fal:<model_type>:<model_name>`.

### Featured Models

- `fal:image:fal-ai/flux-pro/v1.1-ultra` - Professional-grade image generation with up to 2K resolution
- `fal:image:fal-ai/flux/schnell` - Fast, high-quality image generation in 1-4 steps
- `fal:image:fal-ai/fast-sdxl` - High-speed SDXL with LoRA support

:::info
Browse the complete [model gallery](https://fal.ai/models) for the latest models and detailed specifications. Model availability and capabilities are frequently updated.
:::

## Environment Variables

| Variable  | Description                              |
| --------- | ---------------------------------------- |
| `FAL_KEY` | Your API key for authentication with fal |

## Configuration

Configure the fal provider in your promptfoo configuration file. Here's an example using [`fal-ai/flux/schnell`](https://fal.ai/models/fal-ai/flux/schnell):

:::info
Configuration parameters vary by model. For example, `fast-sdxl` supports additional parameters like `scheduler` and `guidance_scale`. Always check the [model-specific documentation](https://fal.ai/models) for supported parameters.
:::

```yaml
providers:
  - id: fal:image:fal-ai/flux/schnell
    config:
      apiKey: your_api_key_here # Alternative to FAL_KEY environment variable
      image_size:
        width: 1024
        height: 1024
      num_inference_steps: 8
      seed: 6252023
```

### Configuration Options

| Parameter             | Type   | Description                             |
| --------------------- | ------ | --------------------------------------- |
| `apiKey`              | string | The API key for authentication with fal |
| `image_size.width`    | number | The width of the generated image        |
| `image_size.height`   | number | The height of the generated image       |
| `num_inference_steps` | number | The number of inference steps to run    |
| `seed`                | number | Sets a seed for reproducible results    |
