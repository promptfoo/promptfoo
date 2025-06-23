# openai-dalle-images (OpenAI DALL-E & GPT Image Generation Example)

You can run this example with:

```bash
npx promptfoo@latest init --example openai-dalle-images
```

A simple example showing how to evaluate OpenAI's image generation models with promptfoo, including DALL-E 2, DALL-E 3, and the new GPT Image 1 model.

## Quick Start

```bash
# Create this example
npx promptfoo@latest init --example openai-dalle-images

# Set your API key
export OPENAI_API_KEY=your-key-here

# Run the evaluation
promptfoo eval

# View the results
promptfoo view
```

## What's in this Example

- Tests multiple artistic style prompts across different subjects
- Compares DALL-E 2, DALL-E 3, and GPT Image 1 outputs
- Demonstrates GPT Image 1 features:
  - High-quality generation with different quality settings
  - Multiple output formats (PNG, JPEG, WebP)
  - Compression control for JPEG/WebP formats
  - Transparent background support
- Configures different image sizes and response formats

## Key Notes

### Model Capabilities

- **DALL-E 2**: Supports sizes 256x256, 512x512, 1024x1024
- **DALL-E 3**: Supports sizes 1024x1024, 1792x1024, 1024x1792 with quality options (standard/hd)
- **GPT Image 1**: Supports sizes 1024x1024, 1024x1536, 1536x1024 with quality options (low/medium/high) and advanced features

### GPT Image 1 Features

- **Quality levels**: `low`, `medium`, `high`, or `auto`
- **Output formats**: `png` (default), `jpeg`, `webp`
- **Compression**: Set `output_compression` (0-100%) for JPEG/WebP
- **Transparency**: Set `background: transparent` for transparent backgrounds (PNG/WebP only)
- **Token-based pricing**: Cost varies by quality and size

### Response Formats

- `response_format: url` (default): Returns image URLs that expire after ~2 hours
- `response_format: b64_json`: Returns raw JSON with base64-encoded image data

## Documentation

- [OpenAI Image Generation API Documentation](https://platform.openai.com/docs/guides/images)
- [GPT Image 1 Model Documentation](https://platform.openai.com/docs/models/gpt-image-1)
- [promptfoo OpenAI Provider Documentation](https://promptfoo.dev/docs/providers/openai)
