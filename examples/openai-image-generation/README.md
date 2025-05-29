# openai-image-generation (OpenAI Image Generation Example)

You can run this example with:

```bash
npx promptfoo@latest init --example openai-image-generation
```

A comprehensive example showing how to evaluate OpenAI's image generation models with promptfoo, including DALL-E 2, DALL-E 3, and the new GPT Image 1 model.

## Quick Start

```bash
# Create this example
npx promptfoo@latest init --example openai-image-generation

# Set your API key
export OPENAI_API_KEY=your-key-here

# Run the evaluation with all models
promptfoo eval

# Run just the GPT Image 1 examples
promptfoo eval -c promptfooconfig.gpt-image.yaml

# View the results
promptfoo view
```

## What's in this Example

### Basic Examples (`promptfooconfig.yaml`)

- Tests artistic style prompts (Van Gogh, Dali, Picasso, etc.)
- Compares DALL-E 3, DALL-E 2, and GPT Image 1 outputs
- Configures different image sizes and response formats
- Tests with different subjects

### Advanced GPT Image 1 Examples (`promptfooconfig.gpt-image.yaml`)

- Demonstrates GPT Image 1's advanced features
- Tests different quality settings (low, medium, high, auto)
- Shows transparent background support
- Compares different output formats (PNG, WebP, JPEG)
- Includes Responses API with image generation tool

## Model Comparison

### DALL-E 2

- **Sizes**: 256x256, 512x512, 1024x1024
- **Features**: Basic image generation, inpainting with masks
- **Cost**: $0.016-$0.020 per image

### DALL-E 3

- **Sizes**: 1024x1024, 1792x1024, 1024x1792
- **Features**: Higher quality, style control (natural/vivid), HD quality option
- **Cost**: $0.04-$0.12 per image

### GPT Image 1 (New!)

- **Sizes**: 1024x1024, 1536x1024, 1024x1536, auto
- **Quality**: low, medium, high, auto
- **Features**:
  - Superior instruction following
  - Text rendering capabilities
  - Transparent backgrounds
  - Multiple output formats (PNG, JPEG, WebP)
  - Compression control for JPEG/WebP
  - Real-world knowledge integration
  - Image editing capabilities
- **Cost**: Token-based pricing (272-6240 tokens per image depending on quality/size)

## Key Features

### Response Formats

- `response_format: url` (default) - Returns image URLs that expire after ~2 hours
- `response_format: b64_json` - Returns raw JSON with base64-encoded image data

### GPT Image 1 Advanced Options

```yaml
providers:
  - id: openai:image:gpt-image-1
    config:
      size: 1024x1024 # or 1536x1024, 1024x1536, auto
      quality: high # low, medium, high, auto
      background: transparent # transparent, opaque, auto
      format: png # png, jpeg, webp
      output_compression: 85 # 0-100 for JPEG/WebP
      moderation: auto # auto, low
```

### Responses API Integration

GPT Image 1 can also be used via the Responses API with the image generation tool:

```yaml
providers:
  - id: openai:responses:gpt-4.1-mini
    config:
      tools:
        - type: image_generation
          size: 1024x1024
          quality: high
          background: transparent
```

This enables:

- Multi-turn image editing conversations
- Streaming partial images during generation
- Integration with other tools and functions
- Conversational image refinement

## Documentation

- [OpenAI Image Generation API Documentation](https://platform.openai.com/docs/guides/images)
- [OpenAI Responses API Documentation](https://platform.openai.com/docs/api-reference/responses)
- [promptfoo OpenAI Provider Documentation](https://promptfoo.dev/docs/providers/openai)
