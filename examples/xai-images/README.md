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

- Tests two artistic style prompts (Van Gogh vs. Dali)
- Generates images using the `grok-2-image` model
- Shows how to request multiple images and different response formats
- Tests with different subjects

## Key Notes

- xAI currently supports the `grok-2-image` model
- `response_format: b64_json` returns raw JSON with base64-encoded image data. Image links with the default format `url` expire after a short time.

## Documentation

- [xAI Image API Documentation](https://docs.x.ai/docs)
- [promptfoo xAI Provider Documentation](https://promptfoo.dev/docs/providers/xai)
