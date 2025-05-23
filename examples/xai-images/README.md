# xai-images (xAI Image Generation Example)

You can run this example with:

```bash
npx promptfoo@latest init --example xai-images
```

A simple example showing how to evaluate xAI's image generation model with promptfoo.

## Quick Start

```bash
# Create this example
npx promptfoo@latest init --example xai-images

# Set your API key
export XAI_API_KEY=your-key-here

# Run the evaluation
promptfoo eval

# View the results
promptfoo view
```

## What's in this Example

- Tests artistic style prompts with different artists
- Generates images using the `grok-2-image` model
- Shows how to request multiple images and different response formats
- Tests with different subjects

## Key Notes

- xAI supports the `grok-2-image` model for image generation
- `response_format: b64_json` returns raw JSON with base64-encoded image data. URLs are the default format.
- xAI automatically revises prompts using a chat model before generating images
- Currently supports `n` (1-10) and `response_format` parameters
- `quality`, `size`, and `style` parameters are not yet supported

## Documentation

- [xAI Image Generation Documentation](https://docs.x.ai/docs#image-generations)
- [promptfoo xAI Provider Documentation](https://promptfoo.dev/docs/providers/xai)
