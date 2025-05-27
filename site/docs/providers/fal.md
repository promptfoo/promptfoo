---
sidebar_position: 42
---

# fal.ai

The `fal` provider connects promptfoo to [fal.ai](https://fal.ai) image generation models using the [fal-js](https://github.com/fal-ai/fal-js) client.

## Quick Start

1. **Install the client**:

   ```sh
   npm install --save @fal-ai/client
   ```

2. **Get your API key** from the [fal dashboard](https://fal.ai/dashboard/keys)

3. **Set your environment variable**:

   ```sh
   export FAL_KEY=your_api_key_here
   ```

4. **Add to your config**:

   ```yaml
   providers:
     - fal:image:fal-ai/flux/schnell
   ```

## Choose Your Model

Select a model based on your use case:

**For speed**: `fal:image:fal-ai/flux/schnell` - Generate images in 1-4 steps  
**For quality**: `fal:image:fal-ai/flux/dev` - High-quality 12B parameter model  
**For text/logos**: `fal:image:fal-ai/ideogram/v3` - Excellent typography handling  
**For professional work**: `fal:image:fal-ai/flux-pro/v1.1-ultra` - Up to 2K resolution

Browse all models at [fal.ai/models](https://fal.ai/models?categories=text-to-image).

## Configure Your Provider

### Basic Setup

```yaml
providers:
  - id: fal:image:fal-ai/flux/schnell
    config:
      seed: 42
```

### Control Image Quality

```yaml
providers:
  - id: fal:image:fal-ai/flux/dev
    config:
      num_inference_steps: 28 # More steps = higher quality
      guidance_scale: 7.5 # Higher values = closer to prompt
      seed: 42 # For reproducible results
```

### Set Image Dimensions

```yaml
providers:
  - id: fal:image:fal-ai/flux-pro/v1.1-ultra
    config:
      image_size:
        width: 1024
        height: 1024
      # Or use aspect ratios for some models:
      # aspect_ratio: "16:9"
```

### Enable Advanced Features

```yaml
providers:
  - id: fal:image:fal-ai/flux-lora
    config:
      loras:
        - path: 'https://example.com/style.safetensors'
          scale: 0.8
```

## Write Effective Tests

### Compare Model Performance

```yaml
description: 'Compare speed vs quality'
providers:
  - id: fal:image:fal-ai/flux/schnell
    label: 'Fast (4 steps)'
  - id: fal:image:fal-ai/flux/dev
    label: 'Quality (28 steps)'
prompts:
  - 'A serene mountain landscape at sunset'
tests:
  - vars: {}
```

### Test Typography Quality

```yaml
providers:
  - fal:image:fal-ai/ideogram/v3
prompts:
  - 'Create a logo with the text "{{company_name}}" in modern typography'
tests:
  - vars:
      company_name: 'TechCorp'
    assert:
      - type: contains
        value: '![Create a logo'
```

### Validate Output Format

```yaml
tests:
  - vars:
      prompt: 'A cute robot'
    assert:
      - type: javascript
        value: |
          // Verify markdown image format
          return output.startsWith('![') && 
                 output.includes('](') && 
                 output.endsWith(')');
```

## Optimize Performance

### Enable Caching

Use fixed seeds to cache expensive generations:

```yaml
providers:
  - id: fal:image:fal-ai/flux/dev
    config:
      seed: 42 # Same seed = same image = cached result
```

### Control Costs

- Use `flux/schnell` for experimentation (faster, cheaper)
- Use `flux/dev` or `flux-pro` for final outputs (slower, higher quality)
- Set `num_inference_steps` lower for faster generation

## Troubleshoot Issues

**"API key is not set"**  
→ Set `FAL_KEY` environment variable or add `apiKey` to config

**"Could not identify provider"**  
→ Use format `fal:image:model-name`, check [model gallery](https://fal.ai/models)

**"Invalid parameters"**  
→ Check model-specific docs, parameters vary by model

**Rate limiting**  
→ Add delays between requests or reduce concurrency

## Configuration Reference

### Common Parameters

| Parameter             | Type   | Description          | Example                            |
| --------------------- | ------ | -------------------- | ---------------------------------- |
| `seed`                | number | Reproducible results | `42`                               |
| `num_inference_steps` | number | Quality vs speed     | `4` (fast) to `50` (quality)       |
| `guidance_scale`      | number | Prompt adherence     | `3.5` (creative) to `15` (precise) |
| `image_size`          | object | Dimensions           | `{width: 1024, height: 1024}`      |
| `aspect_ratio`        | string | Ratio (some models)  | `"16:9"`, `"1:1"`, `"9:16"`        |

### Model-Specific Options

**FLUX models**: Support `image_size` object or predefined ratios  
**Ideogram**: Use `magic_prompt_option` for prompt enhancement  
**LoRA models**: Configure `loras` array with path and scale  
**Bagel**: Enable `use_thought` for higher quality (+20% cost)

## Migration Guide

Upgrading from `@fal-ai/serverless-client`?

1. **Update package**:

   ```sh
   npm uninstall @fal-ai/serverless-client
   npm install @fal-ai/client
   ```

2. **No config changes needed** - promptfoo handles the migration automatically

## Get Help

- [Model gallery](https://fal.ai/models) - Browse available models
- [API docs](https://docs.fal.ai/) - Detailed API reference
- [Discord](https://discord.gg/fal-ai) - Community support
