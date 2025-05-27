---
sidebar_position: 42
---

# fal.ai

The `fal` provider supports the [fal.ai](https://fal.ai) inference API using the [fal-js](https://github.com/fal-ai/fal-js) client, providing a native experience for using fal.ai models in your evaluations.

## Setup

1. Install the fal client as a dependency:

   ```sh
   npm install --save @fal-ai/client
   ```

   :::info Migration Notice
   The `@fal-ai/serverless-client` package has been deprecated in favor of `@fal-ai/client`. If you're upgrading, please check the [migration guide](https://docs.fal.ai/clients/javascript/#migration-from-serverless-client-to-client) for more information.
   :::

2. Create an API key in the [fal dashboard](https://fal.ai/dashboard/keys).
3. Set the `FAL_KEY` environment variable:

   ```sh
   export FAL_KEY=your_api_key_here
   ```

## Provider Format

To run a model, specify the model type and model name: `fal:<model_type>:<model_name>`.

### Featured Models

#### Latest & Most Popular

- `fal:image:fal-ai/imagen4/preview` - Google's highest quality image generation model
- `fal:image:fal-ai/flux-pro/v1.1-ultra` - Professional-grade image generation with up to 2K resolution
- `fal:image:fal-ai/recraft/v3/text-to-image` - SOTA text-to-image with vector art and typography capabilities
- `fal:image:fal-ai/flux/dev` - 12B parameter flow transformer for high-quality images
- `fal:image:fal-ai/flux/schnell` - Fast, high-quality image generation in 1-4 steps

#### High-Performance Models

- `fal:image:fal-ai/ideogram/v3` - Exceptional typography handling and realistic outputs
- `fal:image:fal-ai/stable-diffusion-v35-large` - Improved performance in image quality and typography
- `fal:image:fal-ai/hidream-i1-full` - 17B parameter model with state-of-the-art quality
- `fal:image:fal-ai/bagel` - 7B parameter multimodal model from Bytedance-Seed
- `fal:image:fal-ai/sana` - 4K image generation in less than a second

#### Specialized Models

- `fal:image:fal-ai/flux-lora` - FLUX with LoRA support for personalization
- `fal:image:fal-ai/flux-general` - FLUX with LoRA, ControlNet, and IP-Adapter support
- `fal:image:fal-ai/fast-sdxl` - High-speed SDXL with LoRA support
- `fal:image:fal-ai/omnigen-v1` - Unified model for editing, personalization, and virtual try-on

:::info
Browse the complete [model gallery](https://fal.ai/models?categories=text-to-image) for the latest models and detailed specifications. Model availability and capabilities are frequently updated.
:::

## Environment Variables

| Variable  | Description                              |
| --------- | ---------------------------------------- |
| `FAL_KEY` | Your API key for authentication with fal |

## Configuration

Configure the fal provider in your promptfoo configuration file. Here are examples for different models:

### Basic Configuration

```yaml
providers:
  - id: fal:image:fal-ai/flux/schnell
    config:
      apiKey: your_api_key_here # Alternative to FAL_KEY environment variable
      seed: 6252023
```

### Advanced Configuration with Custom Parameters

```yaml
providers:
  - id: fal:image:fal-ai/flux-pro/v1.1-ultra
    config:
      apiKey: your_api_key_here
      image_size:
        width: 1024
        height: 1024
      num_inference_steps: 8
      guidance_scale: 7.5
      seed: 6252023
```

### Model-Specific Examples

#### FLUX with LoRA Support

```yaml
providers:
  - id: fal:image:fal-ai/flux-lora
    config:
      loras:
        - path: 'https://example.com/lora.safetensors'
          scale: 0.8
      seed: 12345
```

#### Ideogram for Typography

```yaml
providers:
  - id: fal:image:fal-ai/ideogram/v3
    config:
      aspect_ratio: '16:9'
      magic_prompt_option: 'Auto'
      seed: 42
```

#### Bagel Multimodal Model

```yaml
providers:
  - id: fal:image:fal-ai/bagel
    config:
      use_thought: true
      enable_safety_checker: true
      seed: 123456
```

### Configuration Options

| Parameter               | Type    | Description                                       | Models      |
| ----------------------- | ------- | ------------------------------------------------- | ----------- |
| `apiKey`                | string  | The API key for authentication with fal           | All         |
| `image_size.width`      | number  | The width of the generated image                  | Most        |
| `image_size.height`     | number  | The height of the generated image                 | Most        |
| `aspect_ratio`          | string  | Aspect ratio (e.g., "16:9", "1:1", "9:16")        | Some        |
| `num_inference_steps`   | number  | The number of inference steps to run              | Most        |
| `guidance_scale`        | number  | How closely to follow the prompt (1.0-20.0)       | Most        |
| `seed`                  | number  | Sets a seed for reproducible results              | All         |
| `use_thought`           | boolean | Use thought tokens for better quality (+20% cost) | Bagel       |
| `enable_safety_checker` | boolean | Enable safety filtering                           | Some        |
| `loras`                 | array   | LoRA configurations for personalization           | LoRA models |
| `magic_prompt_option`   | string  | Prompt enhancement option                         | Ideogram    |

:::info
Configuration parameters vary significantly by model. Always check the [model-specific documentation](https://fal.ai/models) for supported parameters and their valid ranges.
:::

## Output Format

The fal provider returns generated images in markdown format for easy integration with promptfoo evaluations:

```markdown
![prompt text](https://generated-image-url.com/image.png)
```

This format allows the images to be displayed directly in promptfoo's web interface and evaluation reports.

## Example Usage

### Basic Text-to-Image Generation

```yaml
description: 'Test image generation quality'
providers:
  - fal:image:fal-ai/flux/schnell
prompts:
  - 'A serene mountain landscape at sunset'
  - 'A futuristic city with flying cars'
  - 'A cute robot playing with a cat'
tests:
  - vars: {}
    assert:
      - type: contains
        value: '![A serene mountain landscape at sunset]'
```

### Comparing Different Models

```yaml
description: 'Compare image generation models'
providers:
  - id: fal:image:fal-ai/flux/schnell
    label: 'FLUX Schnell (Fast)'
  - id: fal:image:fal-ai/flux-pro/v1.1-ultra
    label: 'FLUX Pro Ultra (High Quality)'
  - id: fal:image:fal-ai/ideogram/v3
    label: 'Ideogram V3 (Typography)'
prompts:
  - "Create a logo with the text 'AI Company' in modern typography"
tests:
  - vars: {}
```

### Advanced Evaluation with Custom Metrics

```yaml
description: 'Evaluate image generation with custom criteria'
providers:
  - id: fal:image:fal-ai/flux-pro/v1.1-ultra
    config:
      guidance_scale: 7.5
      num_inference_steps: 20
prompts:
  - '{{style}} portrait of {{subject}}'
tests:
  - vars:
      style: 'Renaissance painting'
      subject: 'a wise old wizard'
    assert:
      - type: llm-rubric
        value: 'The image should show artistic quality consistent with Renaissance painting style'
      - type: contains
        value: '![Renaissance painting portrait of a wise old wizard]'
```

## Advanced Features

### Caching

The fal provider supports caching to improve performance and reduce API costs:

```yaml
providers:
  - id: fal:image:fal-ai/flux/schnell
    config:
      seed: 42 # Fixed seed ensures reproducible results for caching
```

### Error Handling

The provider includes comprehensive error handling for common issues:

- Missing API keys
- Invalid model names
- Malformed responses
- Network timeouts

### Type Safety

The provider is fully typed with TypeScript, providing excellent IDE support and compile-time error checking.

## Troubleshooting

### Common Issues

1. **API Key Not Found**: Ensure `FAL_KEY` is set in your environment or provided in the config
2. **Model Not Found**: Verify the model name exists in the [fal.ai model gallery](https://fal.ai/models)
3. **Invalid Parameters**: Check the model-specific documentation for supported parameters
4. **Rate Limiting**: fal.ai may rate limit requests; consider adding delays between evaluations

### Getting Help

- [fal.ai Documentation](https://docs.fal.ai/)
- [fal.ai Discord Community](https://discord.gg/fal-ai)
- [Model Gallery](https://fal.ai/models)
- [API Reference](https://docs.fal.ai/clients/javascript/)

## Migration from @fal-ai/serverless-client

If you're upgrading from the deprecated `@fal-ai/serverless-client`:

1. Update your package.json:

   ```bash
   npm uninstall @fal-ai/serverless-client
   npm install @fal-ai/client
   ```

2. The promptfoo fal provider automatically uses the new client, no configuration changes needed.

3. All existing promptfoo configurations will continue to work without modification.
