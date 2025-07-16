# openai-dalle-images (OpenAI Image Generation Example)

You can run this example with:

```bash
npx promptfoo@latest init --example openai-dalle-images
```

A comprehensive example showing how to evaluate OpenAI's image generation models (DALL-E 2, DALL-E 3, and GPT-image-1) with promptfoo.

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

- Tests artistic style prompts across different subjects
- Compares GPT-image-1, DALL-E 3, and DALL-E 2 outputs
- Demonstrates different quality levels for GPT-image-1
- Configures different image sizes and formats
- Tests with various artistic styles (Van Gogh, Dali, Picasso, Monet, Warhol)

## Key Notes

### Supported Sizes
- **GPT-image-1**: 1024x1024, 1536x1024, 1024x1536, auto
- **DALL-E 3**: 1024x1024, 1792x1024, 1024x1792  
- **DALL-E 2**: 256x256, 512x512, 1024x1024

### GPT-image-1 Features
- **Quality levels**: low, medium, high, auto
- **Output formats**: jpeg, png, webp
- **Special capabilities**: 
  - Better text rendering
  - Support for transparent backgrounds (PNG/WEBP)
  - Image editing with multiple input images (up to 10)
  - Output compression control (0-100 for JPEG/WEBP)

### Pricing (approximate per image)
- **GPT-image-1**: 
  - Low quality: $0.01
  - Medium quality: $0.04
  - High quality: $0.17
- **DALL-E 3**: $0.04-$0.12 depending on size/quality
- **DALL-E 2**: $0.016-$0.02 depending on size

## Documentation

- [OpenAI DALL-E API Documentation](https://platform.openai.com/docs/guides/images)
- [OpenAI GPT-image-1 Documentation](https://cookbook.openai.com/examples/generate_images_with_gpt_image)
- [promptfoo OpenAI Provider Documentation](https://promptfoo.dev/docs/providers/openai)
