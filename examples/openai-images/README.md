# openai-images (OpenAI Image Generation Example)

You can run this example with:

```bash
npx promptfoo@latest init --example openai-images
```

A simple example showing how to evaluate OpenAI's image generation models (GPT Image 1.5, GPT Image 1, GPT Image 1 Mini, DALL-E 3, DALL-E 2) with promptfoo.

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

- Compares GPT Image 1.5, GPT Image 1, GPT Image 1 Mini, DALL-E 3 and DALL-E 2 outputs
- Tests artistic style prompts across different models
- Configures different image sizes and quality settings
- Tests with different subjects

## Supported Models

### GPT Image 1.5 (Recommended)

OpenAI's state-of-the-art image generation model with superior instruction following, prompt adherence, and photorealistic quality. Uses token-based pricing.

```yaml
providers:
  - id: openai:image:gpt-image-1.5
    config:
      size: 1024x1024 # 1024x1024, 1024x1536, 1536x1024, auto
      quality: low # low, medium, high, auto
      background: transparent # transparent, opaque, auto
      output_format: png # png, jpeg, webp
      output_compression: 80 # 0-100, only for jpeg/webp
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
      output_format: png # png, jpeg, webp
      output_compression: 80 # 0-100, only for jpeg/webp
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
      output_format: png # png, jpeg, webp
      output_compression: 80 # 0-100, only for jpeg/webp
      moderation: auto # auto, low
```

### DALL-E 3

Higher image quality than DALL-E 2 with larger resolution support.

```yaml
providers:
  - id: openai:image:dall-e-3
    config:
      size: 1024x1024 # 1024x1024, 1792x1024, 1024x1792
      quality: standard # standard, hd
      style: vivid # vivid, natural
```

### DALL-E 2

Lower cost option with concurrent requests and inpainting support.

```yaml
providers:
  - id: openai:image:dall-e-2
    config:
      size: 512x512 # 256x256, 512x512, 1024x1024
      response_format: url # url, b64_json
```

## Pricing

| Model            | Quality  | Size      | Price per image |
| ---------------- | -------- | --------- | --------------- |
| GPT Image 1.5    | Low      | 1024x1024 | ~$0.064         |
| GPT Image 1.5    | Medium   | 1024x1024 | ~$0.128         |
| GPT Image 1.5    | High     | 1024x1024 | ~$0.192         |
| GPT Image 1      | Low      | 1024x1024 | $0.011          |
| GPT Image 1      | Medium   | 1024x1024 | $0.042          |
| GPT Image 1      | High     | 1024x1024 | $0.167          |
| GPT Image 1 Mini | Low      | 1024x1024 | $0.005          |
| GPT Image 1 Mini | Medium   | 1024x1024 | $0.011          |
| GPT Image 1 Mini | High     | 1024x1024 | $0.036          |
| DALL-E 3         | Standard | 1024x1024 | $0.04           |
| DALL-E 3         | HD       | 1024x1024 | $0.08           |
| DALL-E 2         | -        | 1024x1024 | $0.02           |

**Note:** GPT Image 1.5 uses token-based pricing ($32/1M output image tokens). Prices shown are estimates.

## Documentation

- [OpenAI Image Generation API Documentation](https://platform.openai.com/docs/guides/images)
- [promptfoo OpenAI Provider Documentation](https://promptfoo.dev/docs/providers/openai)
