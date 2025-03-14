# OpenAI DALL-E Image Generation Example

A simple example showing how to evaluate OpenAI's DALL-E image generation models with promptfoo.

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

- Tests two artistic style prompts (Van Gogh vs. Dali)
- Compares DALL-E 3 and DALL-E 2 outputs
- Configures different image sizes and response formats
- Tests with different subjects

## Key Notes

- Each model supports different sizes:
  - DALL-E 3: 1024x1024, 1792x1024, 1024x1792
  - DALL-E 2: 256x256, 512x512, 1024x1024
- `response_format: b64_json` returns raw JSON with base64-encoded image data. Image links with the default format `url` expire after ~ 2 hours.

## Documentation

- [OpenAI DALL-E API Documentation](https://platform.openai.com/docs/guides/images)
- [promptfoo OpenAI Provider Documentation](https://promptfoo.dev/docs/providers/openai)
