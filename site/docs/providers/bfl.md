# Black Forest Labs

The [Black Forest Labs (BFL)](https://blackforestlabs.ai/) provider enables image generation and editing using their FLUX models through promptfoo.

Black Forest Labs offers several FLUX models including Kontext (image-to-image editing), FLUX Pro (text-to-image), and various specialized variants for different use cases.

## Setup

First, obtain an API key from [Black Forest Labs](https://docs.bfl.ml/).

Set the `BFL_API_KEY` environment variable:

```bash
export BFL_API_KEY=your_api_key_here
```

## Configuration

The Black Forest Labs provider uses the following format:

```
bfl:<model-name>
```

### Available Models

| Model              | Description                              | Use Case                        |
| ------------------ | ---------------------------------------- | ------------------------------- |
| `flux-kontext-pro` | Image editing with context understanding | Image-to-image editing          |
| `flux-kontext-max` | Enhanced Kontext model                   | Advanced image editing          |
| `flux-pro-1.1`     | Latest FLUX Pro model                    | High-quality text-to-image      |
| `flux-pro`         | FLUX Pro model                           | Text-to-image generation        |
| `flux-dev`         | Development/testing model                | Experimentation                 |
| `flux-fill-pro`    | Image inpainting model                   | Fill missing parts of images    |
| `flux-canny-pro`   | Canny edge-guided generation             | Structure-controlled generation |
| `flux-depth-pro`   | Depth-guided generation                  | Depth-controlled generation     |

## Usage Examples

### Basic Text-to-Image Generation

```yaml
providers:
  - bfl:flux-pro-1.1

prompts:
  - 'A majestic mountain landscape at sunset'

tests:
  - vars: {}
```

### Image-to-Image Editing with Kontext

```yaml
providers:
  - id: bfl:flux-kontext-pro
    config:
      input_image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD...' # Base64 encoded image

prompts:
  - 'Change the car color to red while maintaining the same style'

tests:
  - vars: {}
```

### Advanced Configuration

```yaml
providers:
  - id: bfl:flux-pro-1.1
    config:
      seed: 42
      aspect_ratio: '16:9'
      output_format: 'jpeg'
      prompt_upsampling: true
      safety_tolerance: 2
      width: 1024
      height: 576

prompts:
  - 'A futuristic cityscape with flying cars'

tests:
  - vars: {}
```

## Configuration Options

| Option              | Type    | Description                                 | Default       |
| ------------------- | ------- | ------------------------------------------- | ------------- |
| `seed`              | number  | Seed for reproducibility                    | Random        |
| `aspect_ratio`      | string  | Image aspect ratio (21:9 to 9:21)           | Model default |
| `output_format`     | string  | Output format: "jpeg" or "png"              | "png"         |
| `prompt_upsampling` | boolean | Enhance prompt creativity                   | false         |
| `safety_tolerance`  | number  | Content moderation level (0-6)              | 2             |
| `input_image`       | string  | Base64 encoded input image (Kontext models) | -             |
| `image_prompt`      | string  | Image prompt (FLUX Pro 1.1)                 | -             |
| `width`             | number  | Image width (FLUX Pro 1.1)                  | 1024          |
| `height`            | number  | Image height (FLUX Pro 1.1)                 | 768           |
| `webhook_url`       | string  | URL for webhook notifications               | -             |
| `webhook_secret`    | string  | Secret for webhook verification             | -             |
| `max_poll_time_ms`  | number  | Maximum polling time in milliseconds        | 300000        |
| `poll_interval_ms`  | number  | Polling interval in milliseconds            | 2000          |

## Model-Specific Features

### Kontext Models (flux-kontext-pro, flux-kontext-max)

Kontext models excel at image-to-image editing:

```yaml
providers:
  - id: bfl:flux-kontext-pro
    config:
      input_image: '{{ image_base64 }}'

prompts:
  - 'Add a hat to the person while maintaining the same style of the painting'
  - 'Change the background to a sunny beach'
  - 'Transform to watercolor painting style'

tests:
  - vars:
      image_base64: 'data:image/jpeg;base64,...'
```

### FLUX Pro 1.1

The latest FLUX Pro model supports additional parameters:

```yaml
providers:
  - id: bfl:flux-pro-1.1
    config:
      width: 1344
      height: 768
      image_prompt: '{{ style_reference }}'

prompts:
  - 'A serene lake surrounded by mountains'

tests:
  - vars:
      style_reference: 'data:image/jpeg;base64,...' # Optional style reference
```

## Prompting Best Practices

### For Text-to-Image (FLUX Pro models)

- Be specific about details you want to see
- Include style descriptors (e.g., "photorealistic", "oil painting", "digital art")
- Specify lighting, composition, and mood
- Use descriptive adjectives for better results

```yaml
prompts:
  - 'A photorealistic portrait of a wise elderly wizard with a long silver beard, wearing deep blue robes, standing in a mystical forest with glowing fireflies, dramatic lighting, highly detailed'
```

### For Image-to-Image (Kontext models)

- Describe what you want to change specifically
- Use "while maintaining" to preserve elements you want to keep
- Be explicit about style preservation when needed
- Start with simple edits for better results

```yaml
prompts:
  - 'Change the car color to red while maintaining the same lighting and background'
  - 'Add snow to the scene while preserving the original composition'
  - 'Transform to impressionist painting style while keeping the same subject matter'
```

## Error Handling

The provider includes comprehensive error handling:

- **Authentication errors**: Verify your `BFL_API_KEY` is set correctly
- **Timeout errors**: Increase `max_poll_time_ms` for complex generations
- **Invalid parameters**: Check model-specific parameter requirements
- **Rate limiting**: The provider automatically handles API rate limits

## Cost Considerations

BFL pricing varies by model:

- **flux-dev**: Lower cost/free tier
- **flux-pro**: Standard pricing
- **flux-pro-1.1**: Premium pricing
- **flux-kontext-pro**: Image editing pricing
- **flux-kontext-max**: Premium editing pricing

The provider includes cost tracking in the response for billing transparency.

## Comparison with Other Image Providers

| Feature                | BFL FLUX     | OpenAI DALL-E | Replicate | fal.ai |
| ---------------------- | ------------ | ------------- | --------- | ------ |
| Image-to-image editing | ✅ (Kontext) | ❌            | ✅        | ✅     |
| High resolution        | ✅           | ✅            | ✅        | ✅     |
| Style transfer         | ✅           | Limited       | ✅        | ✅     |
| Aspect ratio control   | ✅           | ✅            | ✅        | ✅     |
| Real-time generation   | ❌           | ❌            | ❌        | ✅     |
| API reliability        | ✅           | ✅            | ✅        | ✅     |

## Example Evaluation Config

```yaml
description: 'Evaluate BFL FLUX models for different image generation tasks'

providers:
  - id: bfl:flux-pro-1.1
    label: 'FLUX Pro 1.1'
    config:
      aspect_ratio: '16:9'
      output_format: 'jpeg'
  - id: bfl:flux-kontext-pro
    label: 'FLUX Kontext Pro'
    config:
      input_image: '{{ base_image }}'

prompts:
  - '{{ prompt }}'

tests:
  - description: 'Landscape generation'
    vars:
      prompt: 'A serene mountain lake at sunrise with mist and reflection'
  - description: 'Portrait generation'
    vars:
      prompt: 'Professional headshot of a confident business executive'
  - description: 'Image editing'
    vars:
      prompt: 'Change the sky to sunset colors'
      base_image: 'data:image/jpeg;base64,...'

defaultTest:
  assert:
    - type: contains
      value: '![' # Verify markdown image format
    - type: not-contains
      value: 'error'
```

This configuration allows you to evaluate different FLUX models across various image generation and editing tasks.
