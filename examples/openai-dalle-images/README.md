# openai-dalle-images (OpenAI Image Generation Comparison)

You can run this example with:

```bash
npx promptfoo@latest init --example openai-dalle-images
```

A simple example showing how to compare OpenAI's image generation models with promptfoo, including DALL-E 3 and GPT Image 1.

## Quick Start

1. Set your OpenAI API key:

   ```bash
   export OPENAI_API_KEY=your_openai_api_key_here
   ```

2. Run the evaluation:

   ```bash
   npm run local -- eval
   ```

3. View results:
   ```bash
   promptfoo view
   ```

## What's in this Example

- Compares DALL-E 3 and GPT Image 1 image generation
- Tests simple prompts with different subjects
- Demonstrates the basic image generation capabilities of each model

## Key Notes

### Model Capabilities

- **DALL-E 3**: Supports sizes 1024x1024, 1792x1024, 1024x1792 with quality options (standard/hd)
- **GPT Image 1**: Supports sizes 1024x1024, 1024x1536, 1536x1024 with quality options (low/medium/high) and advanced features like transparency and compression

### Response Formats

- `response_format: url` (default): Returns image URLs that expire after ~2 hours
- `response_format: b64_json`: Returns raw JSON with base64-encoded image data
- **Note**: GPT Image 1 always returns base64-encoded images regardless of the `response_format` setting

## Documentation

- [OpenAI Image Generation API Documentation](https://platform.openai.com/docs/guides/images)
- [promptfoo OpenAI Provider Documentation](https://promptfoo.dev/docs/providers/openai)
