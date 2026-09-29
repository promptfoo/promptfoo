# openai-images (OpenAI Image Generation Example)

You can run this example with:

```bash
npx promptfoo@latest init --example openai-images
cd openai-images
```

Compare GPT Image 2.5 Flare and Sunburst with earlier OpenAI image models in promptfoo.

## Quick Start

```bash
# Create this example
npx promptfoo@latest init --example openai-images

# Set your API key
export OPENAI_API_KEY=your-key-here

# Run the evaluation
promptfoo eval

# View the results
promptfoo view
```

## What's in this Example

- Compares GPT Image 2.5 Flare and Sunburst with GPT Image 2, 1.5, 1, and 1 Mini
- Uses text-to-image generation through the Image API generations endpoint
- Tests artistic style prompts across different models
- Configures different image sizes and quality settings
- Tests with different subjects

## Supported Models

### GPT Image 2.5 Flare and Sunburst (Recommended)

Use Flare for everyday image generation. Sunburst is designed for precise editing; this example compares its text-to-image output. Both support custom sizes, transparent backgrounds, and quality settings through `max`.

```yaml
providers:
  - id: openai:image:gpt-image-2.5-flare
    config:
      size: 1536x1024
      quality: high # low, medium, high, xhigh, max, auto
      background: transparent
      output_format: png # png or webp for transparent backgrounds
  - id: openai:image:gpt-image-2.5-sunburst
    config:
      size: 1536x1024
      quality: high
      background: transparent
      output_format: png
```

### GPT Image 2

Earlier image model with flexible custom sizes and opaque backgrounds.

```yaml
providers:
  - id: openai:image:gpt-image-2
    config:
      size: 1024x1024 # common sizes, custom WIDTHxHEIGHT, auto
      quality: low # low, medium, high, auto
      background: opaque # opaque, auto
      output_format: webp # png, jpeg, webp
      output_compression: 80 # 0-100, only set with jpeg/webp
      moderation: auto # auto, low
      n: 1 # 1-10 images
      user: promptfoo-user # optional end-user identifier
```

### GPT Image 1.5

High-quality GPT Image model with strong instruction following, prompt adherence, and photorealistic quality. Uses token-based pricing.

```yaml
providers:
  - id: openai:image:gpt-image-1.5
    config:
      size: 1024x1024 # 1024x1024, 1024x1536, 1536x1024, auto
      quality: low # low, medium, high, auto
      background: transparent # transparent, opaque, auto
      output_format: webp # png, jpeg, webp
      output_compression: 80 # 0-100, only set with jpeg/webp
      moderation: auto # auto, low
```

### GPT Image 1

High-quality image generation model with superior instruction following and text rendering.

```yaml
providers:
  - id: openai:image:gpt-image-1
    config:
      size: 1024x1024 # 1024x1024, 1024x1536, 1536x1024, auto
      quality: low # low, medium, high, auto
      background: transparent # transparent, opaque, auto
      output_format: webp # png, jpeg, webp
      output_compression: 80 # 0-100, only set with jpeg/webp
      moderation: auto # auto, low
```

### GPT Image 1 Mini

Cost-efficient version of GPT Image 1 with the same capabilities at lower cost.

```yaml
providers:
  - id: openai:image:gpt-image-1-mini
    config:
      size: 1024x1024 # 1024x1024, 1024x1536, 1536x1024, auto
      quality: low # low, medium, high, auto
      background: transparent # transparent, opaque, auto
      output_format: webp # png, jpeg, webp
      output_compression: 80 # 0-100, only set with jpeg/webp
      moderation: auto # auto, low
```

### DALL-E 3 and DALL-E 2

`dall-e-3` and `dall-e-2` were [retired from the OpenAI API](https://developers.openai.com/api/docs/deprecations) on May 12, 2026. The provider retains compatibility for gateways that still expose them. Use `gpt-image-2.5-flare` or `gpt-image-2.5-sunburst` for new evals.

Promptfoo's `openai:image` provider currently supports text-to-image generation. Image edits/reference inputs, variations, and streaming partial images are not part of this example and are rejected if configured.

## Pricing

Flare and Sunburst share these [standard rates](https://developers.openai.com/api/docs/pricing), in USD per million tokens:

| Input type | Input | Cached input | Output |
| ---------- | ----- | ------------ | ------ |
| Text       | $5    | $1.25        | —      |
| Image      | $8    | $2           | $30    |

Promptfoo calculates GPT Image 2.5 costs from returned usage. If usage is missing, cost stays unset. Equal token rates do not mean equal cost per image: each model and quality setting can use different token counts.

Output-only estimates for earlier models:

| Model            | Quality | Size      | Price per image |
| ---------------- | ------- | --------- | --------------- |
| GPT Image 2      | Low     | 1024x1024 | $0.006          |
| GPT Image 2      | Medium  | 1024x1024 | $0.053          |
| GPT Image 2      | High    | 1024x1024 | $0.211          |
| GPT Image 1.5    | Low     | 1024x1024 | $0.009          |
| GPT Image 1.5    | Medium  | 1024x1024 | $0.034          |
| GPT Image 1.5    | High    | 1024x1024 | $0.133          |
| GPT Image 1      | Low     | 1024x1024 | $0.011          |
| GPT Image 1      | Medium  | 1024x1024 | $0.042          |
| GPT Image 1      | High    | 1024x1024 | $0.167          |
| GPT Image 1 Mini | Low     | 1024x1024 | $0.005          |
| GPT Image 1 Mini | Medium  | 1024x1024 | $0.011          |
| GPT Image 1 Mini | High    | 1024x1024 | $0.036          |

**Note:** The per-image estimates exclude input tokens. Promptfoo uses returned usage when available. Without usage, GPT Image 2 `auto` quality or custom sizes leave `cost` unset.

## Documentation

- [OpenAI Image Generation API Documentation](https://developers.openai.com/api/docs/guides/image-generation)
- [promptfoo OpenAI Provider Documentation](https://promptfoo.dev/docs/providers/openai)
