# GPT Image 1 Generation Example

This example demonstrates how to use OpenAI's GPT Image 1 model for high-quality image generation with promptfoo.

## Features Demonstrated

- **Multiple Quality Levels**: `low`, `medium`, `high`, and `auto`
- **Various Output Formats**: PNG, JPEG, and WebP
- **Flexible Sizing**: Standard and portrait/landscape orientations
- **Background Control**: Natural backgrounds and transparency support
- **Compression Control**: Optimize file sizes for different use cases

## Configuration Options

### GPT Image 1 Parameters

- **`size`**: Image dimensions (`1024x1024`, `1024x1536`, `1536x1024`, `auto`)
- **`quality`**: Generation quality (`low`, `medium`, `high`, `auto`)
- **`output_format`**: Output format (`png`, `jpeg`, `webp`)
- **`output_compression`**: Compression for JPEG/WebP (0-100)
- **`background`**: Background handling (`natural`, `transparent`)

## Running the Example

```bash
# Run with a single test case
npm run local -- eval -c examples/gpt-image-1-generation/promptfooconfig.yaml -n 1

# Run all test cases
npm run local -- eval -c examples/gpt-image-1-generation/promptfooconfig.yaml

# View results in the web UI
npm run local -- view
```

## Cost Considerations

GPT Image 1 uses token-based pricing:
- **Low quality**: ~1,000 tokens per image
- **Medium quality**: ~2,000 tokens per image  
- **High quality**: ~4,000 tokens per image
- **Auto quality**: Variable based on prompt complexity

## Example Output

The example includes various scenarios:
- Nature and landscape scenes
- Urban environments
- Fantasy and artistic content
- Logo designs with transparency
- Different artistic styles and formats

Each test demonstrates different aspects of GPT Image 1's capabilities while showcasing the advanced configuration options available. 