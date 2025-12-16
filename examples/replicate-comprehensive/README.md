# replicate-comprehensive (Comprehensive Replicate Testing)

You can run this example with:

```bash
npx promptfoo@latest init --example replicate-comprehensive
```

This example demonstrates the full capabilities of the Replicate provider in promptfoo, including text generation and image generation.

## Environment Variables

This example requires:

- `REPLICATE_API_TOKEN` - Your Replicate API key (get one at https://replicate.com/account/api-tokens)

Set this in your environment:

```bash
export REPLICATE_API_TOKEN=r8_your_api_token_here
```

## Features Demonstrated

### 1. Text Generation with Llama 3

- Uses Meta's Llama 3 8B Instruct model
- Configurable temperature, token limits, and sampling parameters
- Demonstrates creative writing and explanatory tasks

### 2. Image Generation with SDXL

- Uses Stable Diffusion XL for high-quality image generation
- Custom resolution settings (512x512 for faster generation)
- Tests both photorealistic and artistic styles

## Running the Example

1. Set your Replicate API token:

   ```bash
   export REPLICATE_API_TOKEN=your_token_here
   ```

2. Run the evaluation:

   ```bash
   promptfoo eval
   ```

3. View the results:
   ```bash
   promptfoo view
   ```

## Understanding the Configuration

### Provider Configuration

```yaml
providers:
  - id: replicate:meta/meta-llama-3-8b-instruct
    config:
      temperature: 0.5 # Balanced creativity
      max_new_tokens: 200 # Limit response length
```

### Assertion Types

The example uses various assertion types:

- `contains-any`: Checks for specific keywords
- `javascript`: Custom validation logic
- `is-valid-openai-image-generation-response`: Validates image URLs

## Customization Ideas

1. **Try Different Models**:
   - Text: `replicate:meta/meta-llama-3-70b-instruct` (larger, more capable)
   - Images: `replicate:image:playgroundai/playground-v2.5-1024px-aesthetic`

2. **Adjust Parameters**:
   - Increase `temperature` for more creative outputs
   - Change image dimensions for different aspect ratios
   - Modify `num_inference_steps` for quality vs speed tradeoff

3. **Add More Tests**:
   - Code generation tasks
   - Language translation
   - Style transfer for images
   - Different artistic styles

## Troubleshooting

- **Rate Limits**: Replicate has rate limits; add delays between tests if needed
- **Timeouts**: Large models may take 30-60 seconds; the provider handles polling automatically
- **Image URLs**: Generated images are temporary; save them if needed for long-term use

## Cost Considerations

- Text generation: ~$0.0005 per 1K tokens (Llama 3 8B)
- Image generation: ~$0.012 per image (SDXL)
- Check current pricing at https://replicate.com/pricing
