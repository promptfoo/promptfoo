# nscale (Nscale Example (Cost-Effective AI Inference))

This example demonstrates how to use the Nscale provider with promptfoo to evaluate Nscale Serverless Inference API models, which offer cost-effective, high-performance AI inference with zero rate limits.

You can run this example with:

```bash
npx promptfoo@latest init --example nscale
```

## Prerequisites

### Authentication Setup

1. Sign up for an account at [Nscale](https://nscale.com/)
2. Navigate to your account settings
3. Go to "Service Tokens" section
4. Generate a service token and set it as an environment variable:

```bash
export NSCALE_SERVICE_TOKEN="your-service-token-here"
```

Alternatively, you can add it to your `.env` file:

```
NSCALE_SERVICE_TOKEN=your-service-token-here
```

## Example Configuration

This repository contains an example configuration demonstrating Nscale's capabilities:

### Basic Model Evaluation (`promptfooconfig.yaml`)

This configuration evaluates two popular Nscale models on their ability to solve reasoning problems and generate creative content.

```bash
promptfoo eval
```

**Expected output:** You'll see a comparison of how each model handles different types of tasks, with metrics on accuracy, creativity, and response quality.

## Model Capabilities

Nscale supports many popular models with competitive pricing:

**Text Generation Models:**

- `openai/gpt-oss-120b` - OpenAI's 120B open-weight model (featured in example)
- `openai/gpt-oss-20b` - OpenAI's 20B model
- `meta/llama-3.3-70b-instruct` - Meta's Llama 3.3 70B model
- `meta/llama-4-scout-17b-16e-instruct` - Llama 4 Scout 17B model
- `qwen/qwen-3-235b-a22b-instruct` - Qwen 3 235B model
- `deepseek/deepseek-r1-distill-llama-70b` - DeepSeek R1 Distill 70B
- `mistral/devstral-small-2505` - Mistral's Devstral Small model

**Embedding Models:**

- `qwen/qwen3-embedding-8b` - Qwen 3 8B Embedding model

**Text-to-Image Models:**

- `flux/flux.1-schnell` - Flux.1 Schnell image generation model
- `stable-diffusion/xl-1.0` - Stable Diffusion XL 1.0

## Pricing & Usage

Nscale offers highly competitive pricing with up to 80% cost savings compared to other providers:

- **Text Generation:** Starting from $0.01 input / $0.03 output per 1M tokens
- **Image Generation:** Starting from $0.0008 per mega-pixel
- **Zero rate limits** and **no cold starts**

Check the [official pricing page](https://docs.nscale.com/pricing) for the most current rates.

## Learn More

- [Nscale Provider Documentation](https://promptfoo.dev/docs/providers/nscale)
- [Nscale API Reference](https://docs.nscale.com/)
- [Nscale Serverless Inference](https://nscale.com/serverless)
- [Nscale Model Marketplace](https://nscale.com/models)
