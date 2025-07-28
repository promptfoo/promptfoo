# replicate-quickstart (Replicate Quick Start)

You can run this example with:

```bash
npx promptfoo@latest init --example replicate-quickstart
```

This is a minimal example to test the Replicate provider with promptfoo.

## Quick Start

1. Get a Replicate API token from https://replicate.com/account/api-tokens

2. Set the environment variable:
   ```bash
   export REPLICATE_API_TOKEN=r8_your_token_here
   ```

3. Run the evaluation:
   ```bash
   promptfoo eval
   ```

## What This Tests

This example uses Replicate's "hello-world" model - a simple, fast model that's perfect for testing your setup. It:

- Verifies your API key is working
- Tests basic prompt templating
- Demonstrates simple assertions
- Runs quickly (< 5 seconds per test)

## Next Steps

Once this works, try:

1. **Different Models**: Replace the model ID with:
   - `replicate:meta/meta-llama-3-8b-instruct` - For text generation
   - `replicate:image:stability-ai/sdxl` - For image generation

2. **More Examples**: Check out:
   - `replicate-llama2` - Advanced text generation
   - `replicate-comprehensive` - All provider features

## Troubleshooting

- **API Key Error**: Make sure `REPLICATE_API_TOKEN` is set correctly
- **Model Not Found**: Check the model ID matches one from https://replicate.com/explore
- **Timeout**: Some models take 30-60 seconds on first run (cold start) 