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

```env
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

### Image Generation Evaluation (`image-promptfooconfig.yaml`)

This configuration compares Nscale's image generation models on various prompts to evaluate their quality and consistency.

```bash
promptfoo eval -c image-promptfooconfig.yaml
```

**Expected output:** You'll see generated images from different models (Flux.1 Schnell, SDXL Lightning, Stable Diffusion XL) for comparison across various image types including landscapes, futuristic scenes, portraits, and abstract art.

## Model Capabilities

Nscale supports many popular models with competitive pricing:

**Text Generation Models:**

- `openai/gpt-oss-120b` - OpenAI's 120B open-weight model
- `openai/gpt-oss-20b` - OpenAI's 20B model
- `qwen/qwen-3-235b-a22b-instruct` - Qwen 3 235B model
- `qwen/qwen-3-235b-a22b-instruct-2507` - Qwen 3 235B Instruct 2507
- `qwen/qwen-3-4b-thinking-2507` - Qwen 3 4B Thinking 2507
- `qwen/qwen-3-8b` - Qwen 3 8B model
- `qwen/qwen-3-14b` - Qwen 3 14B model
- `qwen/qwen-3-32b` - Qwen 3 32B model
- `qwen/qwen-2.5-coder-3b-instruct` - Qwen 2.5 Coder 3B Instruct
- `qwen/qwen-2.5-coder-7b-instruct` - Qwen 2.5 Coder 7B Instruct
- `qwen/qwen-2.5-coder-32b-instruct` - Qwen 2.5 Coder 32B Instruct
- `qwen/qwq-32b` - Qwen QwQ 32B model
- `meta/llama-3.3-70b-instruct` - Meta's Llama 3.3 70B model
- `meta/llama-3.1-8b-instruct` - Meta's Llama 3.1 8B model
- `meta/llama-4-scout-17b-16e-instruct` - Llama 4 Scout 17B model (Image-Text-to-Text)
- `deepseek/deepseek-r1-distill-llama-70b` - DeepSeek R1 Distill Llama 70B
- `deepseek/deepseek-r1-distill-llama-8b` - DeepSeek R1 Distill Llama 8B
- `deepseek/deepseek-r1-distill-qwen-1.5b` - DeepSeek R1 Distill Qwen 1.5B
- `deepseek/deepseek-r1-distill-qwen-7b` - DeepSeek R1 Distill Qwen 7B
- `deepseek/deepseek-r1-distill-qwen-14b` - DeepSeek R1 Distill Qwen 14B
- `deepseek/deepseek-r1-distill-qwen-32b` - DeepSeek R1 Distill Qwen 32B
- `mistral/devstral-small-2505` - Mistral's Devstral Small model
- `mistral/mixtral-8x22b-instruct-v0.1` - Mixtral 8x22B Instruct

**Embedding Models:**

- `Qwen/Qwen3-Embedding-8B` - Qwen 3 8B Embedding model

**Text-to-Image Models:**

- `BlackForestLabs/FLUX.1-schnell` - Flux.1 Schnell image generation model
- `stabilityai/stable-diffusion-xl-base-1.0` - Stable Diffusion XL 1.0
- `ByteDance/SDXL-Lightning-4step` - SDXL Lightning 4-step
- `ByteDance/SDXL-Lightning-8step` - SDXL Lightning 8-step

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
