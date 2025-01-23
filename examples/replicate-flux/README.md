# Replicate FLUX Models Example

This example demonstrates how to use different FLUX models from Replicate for image generation. It showcases three different FLUX models with various configurations optimized for different use cases.

## Models Used

1. **FLUX Schnell** (`black-forest-labs/flux-schnell`)

   - Optimized for speed and rapid iteration
   - Uses `go_fast` mode and fewer inference steps
   - Great for prototyping and quick tests

2. **FLUX Pro Ultra** (`black-forest-labs/flux-1.1-pro-ultra`)

   - Highest quality output
   - Uses original bf16 precision
   - Supports up to 4 megapixel images
   - Best for final, production-quality images

3. **FLUX Pro** (`black-forest-labs/flux-pro`)
   - Balanced quality and speed
   - Supports multiple outputs per prompt
   - Good for generating variations with fixed seeds

## Configuration Options

The example demonstrates various FLUX-specific parameters:

- `go_fast`: Toggle between fast (fp8) and high-quality (bf16) modes
- `num_inference_steps`: Control generation quality (1-4 steps)
- `megapixels`: Output resolution ("1" to "4")
- `aspect_ratio`: Image dimensions ("1:1", "16:9", "4:3")
- `output_format`: Image format (webp, png)
- `output_quality`: Compression quality for webp
- `num_outputs`: Number of variations to generate
- `seed`: Control reproducibility

## Running the Example

1. Set your Replicate API token:

```bash
export REPLICATE_API_TOKEN=your_token_here
```

2. Run the evaluation:

```bash
promptfoo eval -c promptfooconfig.yaml
```

## Test Cases

The example includes test cases for different image styles:

- Photorealistic landscapes
- Detailed character portraits
- Abstract artistic compositions

Each test verifies both the content and format of the generated images.

## Tips

- Use FLUX Schnell for rapid prototyping
- Switch to FLUX Pro Ultra for final, high-quality outputs
- Use fixed seeds when you need reproducible results
- Adjust `maxConcurrency` and `delay` to handle rate limits
- Consider output format based on your needs (webp for web, png for quality)

## Additional Resources

- [FLUX Models Documentation](https://replicate.com/black-forest-labs)
- [Replicate API Documentation](https://replicate.com/docs)
- [promptfoo Documentation](https://promptfoo.dev/docs/configuration/providers/replicate)
