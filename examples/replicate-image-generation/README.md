# replicate-image-generation (State-of-the-Art Image Generation)

You can run this example with:

```bash
npx promptfoo@latest init --example replicate-image-generation
```

This example demonstrates state-of-the-art image generation using Replicate's latest models, particularly the FLUX family from Black Forest Labs.

## Features

This example tests:

- **FLUX 1.1 Pro Ultra** - The highest quality model supporting up to 4MP images
- **FLUX 1.1 Pro Ultra (Raw Mode)** - For authentic, photorealistic results
- **FLUX Dev** - Open-source version for commercial use
- **FLUX Dev Realism** - Specialized for photorealistic outputs
- **Stable Diffusion XL** - For comparison with previous generation

## Environment Setup

1. Get a Replicate API token from https://replicate.com/account/api-tokens
2. Set the environment variable:
   ```bash
   export REPLICATE_API_TOKEN=r8_your_token_here
   ```

## Running the Example

### Full Test Suite (8 different image types across 5 models = 40 images)

```bash
promptfoo eval
```

### Quick Test (2 images with the best model)

```bash
promptfoo eval --filter-providers flux-1.1-pro-ultra --max-concurrency 1
```

### Test Specific Image Types

```bash
# Test only portraits
promptfoo eval --filter-tests "Photorealistic portrait"

# Test only landscapes and architecture
promptfoo eval --filter-tests "landscape|architecture"
```

## Image Types Tested

1. **Photorealistic Portrait** - Professional headshots
2. **Artistic Landscape** - Traditional painting style
3. **Architectural Visualization** - Modern building photography
4. **Product Photography** - Commercial product shots
5. **Abstract Art** - Expressionist paintings
6. **Science Fiction** - Cyberpunk cityscapes
7. **Food Photography** - Culinary presentation
8. **Wildlife Photography** - Nature and animals

## Model Comparison

| Model                    | Best For        | Speed  | Cost          | Resolution |
| ------------------------ | --------------- | ------ | ------------- | ---------- |
| FLUX 1.1 Pro Ultra       | Highest quality | Fast   | $0.06/image   | Up to 4MP  |
| FLUX 1.1 Pro Ultra (Raw) | Photorealism    | Fast   | $0.06/image   | Up to 4MP  |
| FLUX Dev                 | General use     | Medium | ~$0.02/image  | 1024x1024  |
| FLUX Dev Realism         | Photorealistic  | Medium | ~$0.028/image | 1024x1024  |
| SDXL                     | Artistic styles | Fast   | ~$0.01/image  | 1024x1024  |

## Configuration Options

You can customize generation parameters:

```yaml
providers:
  - id: replicate:image:black-forest-labs/flux-dev
    config:
      width: 1344 # Image width
      height: 768 # Image height
      num_outputs: 1 # Number of images to generate
      guidance: 3.5 # How closely to follow the prompt (1-20)
      num_inference_steps: 28 # Quality vs speed tradeoff
      output_format: 'png' # png, webp, or jpg
      seed: 42 # For reproducible results
```

## Important: Image URL Expiration

:::warning
**Replicate image URLs expire after approximately 24 hours.** To preserve generated images, use the included `save-images.js` hook that automatically downloads all images during evaluation.
:::

## Automatic Image Downloads

This example includes a `save-images.js` hook that automatically downloads all generated images to an `images/` directory. To enable it:

```yaml
# Add to any config file
extensions:
  - file://save-images.js:hook
```

Or run with the included configuration:

```bash
promptfoo eval -c promptfooconfig-with-download.yaml
```

Downloaded images will be saved as:

- `images/flux-dev-red-apple-on-a-white-table-2025-07-28T12-30-45.png`
- `images/sdxl-portrait-of-elderly-man-2025-07-28T12-31-02.png`

## Tips

1. **For best quality**: Use FLUX 1.1 Pro Ultra
2. **For photorealism**: Use FLUX 1.1 Pro Ultra with `raw: true`
3. **For commercial use with downloaded weights**: Use FLUX Dev
4. **For artistic styles**: SDXL often performs better than FLUX
5. **Always download images** if you need them later - URLs expire!

## Viewing Results

After running the evaluation:

1. Check the terminal for immediate results
2. Open the generated web UI for visual comparison
3. Images are displayed inline with markdown formatting

## Cost Estimation

Running the full test suite (40 images) costs approximately:

- FLUX 1.1 Pro Ultra: 16 images × $0.06 = $0.96
- FLUX Dev models: 16 images × ~$0.025 = $0.40
- SDXL: 8 images × $0.01 = $0.08
- **Total: ~$1.44**

## Troubleshooting

1. **Rate limits**: Replicate has rate limits. Use `--delay 1000` to add delays between requests or `--max-concurrency 1` to run sequentially
2. **Timeouts**: Some models take 20-30 seconds on first run (cold start). The provider handles polling automatically
3. **API errors**: Ensure your Replicate API token is valid and has credits
4. **Model not found**: Check the model ID matches one from https://replicate.com/explore
