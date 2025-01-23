---
sidebar_position: 99
---

# Replicate

Replicate is an API for machine learning models. It hosts a wide variety of state-of-the-art AI models across different domains.

## Authentication

You can authenticate with Replicate in several ways:

1. Using the `auth` parameter in your config (recommended):

```yaml
providers:
  - id: replicate:black-forest-labs/flux-schnell
    config:
      auth: 'your-replicate-token'
```

2. Using the legacy `apiKey` parameter (supported for backward compatibility):

```yaml
providers:
  - id: replicate:black-forest-labs/flux-schnell
    config:
      apiKey: 'your-replicate-token'
```

3. Using environment variables:

- `REPLICATE_API_TOKEN` (recommended)
- `REPLICATE_API_KEY` (alternative)

## Model Formats

To run a model, specify the Replicate model name and version in one of these formats:

- `owner/name` (uses the latest version)
- `owner/name:version` (uses a specific version)

For example:

```yaml
providers:
  - id: replicate:black-forest-labs/flux-schnell:39ed52f2a78e934b3ba6e2a89f5b1c712de17b06d828e588458e4add38383b0f
```

## Configuration

The Replicate provider supports several configuration options that can be used to customize the behavior of the models:

| Parameter             | Description                                                 |
| --------------------- | ----------------------------------------------------------- |
| `auth`                | Your Replicate API token (recommended)                      |
| `apiKey`              | Alternative way to specify your API token (legacy support)  |
| `width`               | Output image width (model-dependent)                        |
| `height`              | Output image height (model-dependent)                       |
| `num_inference_steps` | Number of inference steps for generation                    |
| `guidance_scale`      | How closely to follow the prompt (default varies by model)  |
| `seed`                | Sets a seed for reproducible results                        |
| `negative_prompt`     | Things to avoid in the generation                           |
| `mode`                | Generation mode (e.g., "raw" or "ultra" for FLUX Pro Ultra) |
| `strength`            | Strength of conditioning for controlled generation          |
| `variation_strength`  | Strength of variation for Redux models                      |
| `system_prompt`       | System-level prompt for text models                         |
| `max_new_tokens`      | Maximum number of tokens to generate                        |
| `temperature`         | Controls randomness in text generation                      |
| `top_p`               | Controls nucleus sampling                                   |
| `top_k`               | Controls top-k sampling                                     |

:::warning
Not every model supports every parameter. Be sure to review the API provided by the model beforehand.
:::

## Environment Variables

The following environment variables are supported:

- `REPLICATE_API_TOKEN` - Your Replicate API token (recommended)
- `REPLICATE_API_KEY` - Alternative way to specify your API token
- `REPLICATE_MAX_NEW_TOKENS` - Maximum number of new tokens to generate
- `REPLICATE_TEMPERATURE` - Temperature for generation
- `REPLICATE_TOP_P` - Top-p value for nucleus sampling
- `REPLICATE_TOP_K` - Top-k value for sampling
- `REPLICATE_SYSTEM_PROMPT` - System-level prompt
- `REPLICATE_SEED` - Seed for reproducible results
- `PROMPTFOO_DELAY_MS` - Delay between API calls (useful for rate limits)
- `PROMPTFOO_REQUEST_BACKOFF_MS` - Base backoff time for retries

## File Outputs

Starting with Replicate v1.0.1, file outputs (like images, videos, or audio) are returned as URLs that can be used directly. The output will be formatted as a markdown-compatible link that can be used in documentation or UI.

## Popular Models

Here are some of the most widely used models on Replicate:

### Text-to-Video Generation

- **minimax/video-01**: Generate 6-second videos from prompts or images. Supports character-based videos with reference images.
- **tencent/hunyuan-video**: High-quality video generation with realistic motion from text descriptions.
- **luma/ray**: Fast, high-quality text-to-video and image-to-video generation.

### Text-to-Image Generation

- **black-forest-labs/flux-1.1-pro-ultra**: High-quality image generation with ultra and raw modes, supporting up to 4 megapixel images.
- **recraft-ai/recraft-v3**: SOTA in image generation with strong text rendering capabilities.
- **bytedance/sdxl-lightning-4step**: Fast text-to-image model optimized for speed and quality.

### Image Processing

- **salesforce/blip**: Generate accurate image captions.
- **sczhou/codeformer**: Restore and enhance old photos and AI-generated faces.
- **xinntao/gfpgan**: Practical face restoration for old photos and AI-generated faces.

### AI Safety and Analysis

- **falcons-ai/nsfw_image_detection**: Fine-tuned Vision Transformer for content moderation.
- **andreasjansson/clip-features**: Extract CLIP features for advanced image analysis.

### FLUX Family Models

The FLUX family of models from Black Forest Labs represents some of the most advanced and widely-used image generation models:

#### Core Models

- **flux-1.1-pro-ultra**: Flagship model supporting ultra and raw modes for up to 4 megapixel images. Best for high-quality, photorealistic outputs.
- **flux-schnell**: Ultra-fast image generation model optimized for rapid development and personal use.
- **flux-dev**: 12B parameter rectified flow transformer for high-quality text-to-image generation.
- **flux-pro**: State-of-the-art model with exceptional prompt following and output diversity.

#### Specialized Models

- **flux-fill-pro**: Professional inpainting and outpainting for seamless image editing and extension.
- **flux-depth-pro**: Depth-aware image generation for preserving spatial relationships.
- **flux-canny-pro**: Edge-guided generation using Canny edge detection for precise structure control.

#### Fine-Tuning Support

- **flux-dev-lora**: Supports fast fine-tuned LoRA inference for customized image generation.
- **flux-schnell-lora**: Fastest model with fine-tuning capabilities.

:::tip
FLUX models are known for their:

- Exceptional image quality and prompt adherence
- Fast generation speeds (especially Schnell variants)
- Support for various control methods (depth, edges, inpainting)
- Fine-tuning capabilities with LoRA
  :::

## Image Generation Examples

FLUX models offer various capabilities for image generation and manipulation. Here are some examples:

### Basic Image Generation

Using the fast FLUX Schnell model for rapid iteration:

```yaml
prompts:
  - 'Generate an image: {{subject}}'

providers:
  - id: replicate:black-forest-labs/flux-schnell
    config:
      width: 768
      height: 768
      num_inference_steps: 20 # Faster generation

tests:
  - vars:
      subject: 'a serene mountain landscape at sunset'
```

### High-Quality Generation

Using FLUX Pro Ultra for maximum quality:

```yaml
providers:
  - id: replicate:black-forest-labs/flux-1.1-pro-ultra
    config:
      width: 1024
      height: 1024
      mode: 'raw' # For more photorealistic results
      num_inference_steps: 50
```

### Image Inpainting

Using FLUX Fill Pro for seamless editing:

```yaml
providers:
  - id: replicate:black-forest-labs/flux-fill-pro
    config:
      image: 'path/to/original.png'
      mask: 'path/to/mask.png'
      prompt: 'a red sports car'
```

### FLUX Configuration Parameters

These parameters are supported across FLUX models:

| Parameter             | Description                                        |
| --------------------- | -------------------------------------------------- |
| `width`               | Output image width (up to 4096 for Ultra models)   |
| `height`              | Output image height (up to 4096 for Ultra models)  |
| `mode`                | Generation mode ("raw" or "ultra" for Pro Ultra)   |
| `num_inference_steps` | Number of steps (more = higher quality, slower)    |
| `guidance_scale`      | How closely to follow the prompt (default: 7.5)    |
| `seed`                | Seed for reproducible results                      |
| `negative_prompt`     | Things to avoid in the generation                  |
| `strength`            | Strength of conditioning for controlled generation |
| `variation_strength`  | Strength of variation for Redux models             |

:::tip

- Use Schnell models for rapid prototyping and iteration
- Use Pro/Ultra models for final, high-quality outputs
- Specialized models (Fill, Canny, Depth) offer precise control
  :::

## Troubleshooting

### Rate Limits

If you encounter rate limits with Replicate:

1. **Reduce concurrency** by setting `--max-concurrency 1` in the CLI or `evaluateOptions.maxConcurrency` in the config
2. **Add delay between requests** using `--delay 3000` in CLI, `evaluateOptions.delay` in config, or `PROMPTFOO_DELAY_MS` environment variable
3. **Adjust retry backoff** using `PROMPTFOO_REQUEST_BACKOFF_MS` (defaults to 5000ms)

### Common Issues

1. **Model Version Not Found**: Ensure you're using a valid model version hash or omit it to use the latest version
2. **Authentication Errors**: Verify your API token is correct and has necessary permissions
3. **Invalid Parameters**: Check the model's documentation for supported parameters and their valid ranges
4. **File Output Errors**: Ensure your code properly handles the URL format returned for file outputs

:::tip
For the best experience with FLUX models:

- Start with Schnell variants for rapid prototyping
- Use Pro/Ultra models for production-quality outputs
- Consider using specialized models (Fill, Canny, Depth) for specific needs
- Monitor your API usage through the Replicate dashboard
  :::
