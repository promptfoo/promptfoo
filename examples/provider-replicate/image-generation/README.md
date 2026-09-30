# provider-replicate/image-generation (Image Generation)

Compare FLUX and Stable Diffusion image generation on Replicate. The main config runs eight prompts across five provider configurations, including FLUX 1.1 Pro Ultra with and without raw mode.

## Environment Setup

Create a [Replicate API token](https://replicate.com/account/api-tokens) and set it in your shell:

```bash
export REPLICATE_API_TOKEN=your_token_here
```

Copy the example:

```bash
npx promptfoo@latest init --example provider-replicate/image-generation
cd provider-replicate/image-generation
```

## Running the Example

Run the six-image quick config:

```bash
npx promptfoo@latest eval -c quick-test.yaml --max-concurrency 1
```

Run all 40 images:

```bash
npx promptfoo@latest eval
```

Each run uses your Replicate account and incurs the selected models' generation charges. The assertions check that an image was returned; they do not judge image quality.

## Configuration Options

Adjust the provider settings in the YAML config. Supported options depend on the Replicate model:

```yaml
providers:
  - id: replicate:image:black-forest-labs/flux-dev
    config:
      width: 1344
      height: 768
      num_outputs: 1
      guidance: 3.5
      num_inference_steps: 28
      output_format: png
      seed: 42
```

## Saving Generated Images

Replicate image URLs are temporary. Promptfoo downloads generated images and stores them through its blob storage before saving results. No download hook is needed. Assertions can inspect `context.providerResponse.images`.

## Viewing Results

```bash
npx promptfoo@latest view
```

The viewer displays images from the saved result for visual comparison.

## Troubleshooting

- For rate limits, add `--delay 1000` or use `--max-concurrency 1`.
- For API errors, check that the token is valid and the account has credits.
- For an unavailable model, check its identifier on [Replicate](https://replicate.com/explore).
