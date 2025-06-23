# OpenAI Image Generation Example

This example demonstrates how to use OpenAI's image generation models with promptfoo.

## Features Demonstrated

- **DALL-E 3 Image Generation**: High-quality image creation from text prompts
- **Multiple Quality Levels**: Standard and HD quality options
- **Flexible Sizing**: Square and portrait/landscape orientations
- **Inline Prompts**: Clean configuration without external files

## Configuration Options

### DALL-E 3 Parameters

- **`size`**: Image dimensions (`1024x1024`, `1024x1792`, `1792x1024`)
- **`quality`**: Generation quality (`standard`, `hd`)
- **`style`**: Image style (`natural`, `vivid`)
- **`response_format`**: Output format (`url`, `b64_json`)

## Running the Example

```bash
# Run with a single test case
npm run local -- eval -c examples/openai-image-generation/promptfooconfig.yaml -n 1

# Run all test cases
npm run local -- eval -c examples/openai-image-generation/promptfooconfig.yaml

# View results in the web UI
npm run local -- view
```

You can run this example with:

```bash
npx promptfoo@latest init --example openai-image-generation
```

## Cost Considerations

DALL-E 3 pricing:

- **Standard 1024×1024**: $0.040 per image
- **Standard 1024×1792 or 1792×1024**: $0.080 per image
- **HD 1024×1024**: $0.080 per image
- **HD 1024×1792 or 1792×1024**: $0.120 per image

## Example Output

The example includes various scenarios:

- Nature and landscape scenes with photorealistic style
- Fantasy content with artistic flair
- Different prompt structures to test model capabilities

Each test demonstrates different aspects of DALL-E 3's image generation while showcasing clean configuration patterns.

## Future Plans

**GPT Image 1 Support**: Once OpenAI releases GPT Image 1 to their public API, this example will be updated to include advanced features like:

- Token-based pricing model
- Background transparency control
- Multiple output formats (PNG, JPEG, WebP)
- Compression control for optimization
