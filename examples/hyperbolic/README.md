# hyperbolic

This directory contains examples for testing Hyperbolic AI models with promptfoo.

You can run this example with:

```bash
npx promptfoo@latest init --example hyperbolic
```

## Examples

### Quick Test (`promptfooconfig.yaml`)

Basic functionality test with Llama-3.1-70B to verify API connectivity.

### Reasoning Models (`promptfooconfig.reasoning.yaml`)

Creative reasoning puzzles using DeepSeek-V3 and Llama-3.1-70B models.

### Image Generation (`promptfooconfig.image-generation.yaml`)

Text-to-image generation using SDXL1.0-base model.

### Audio Generation (`promptfooconfig.audio-generation.yaml`)

Text-to-speech synthesis using Melo-TTS model.

### Multimodal Vision (`promptfooconfig.multimodal.yaml`)

Vision-language tasks using Qwen2.5-VL-7B model.

## Running the Examples

To run any of these examples:

```bash
# Quick connectivity test
npx promptfoo eval -c promptfooconfig.yaml

# Reasoning capabilities
npx promptfoo eval -c promptfooconfig.reasoning.yaml

# Image generation
npx promptfoo eval -c promptfooconfig.image-generation.yaml

# Audio synthesis
npx promptfoo eval -c promptfooconfig.audio-generation.yaml

# Vision-language tasks
npx promptfoo eval -c promptfooconfig.multimodal.yaml

# View results in web UI
npx promptfoo view
```

## Prerequisites

- Hyperbolic API key set in `HYPERBOLIC_API_KEY` environment variable
- Get your API key from [https://app.hyperbolic.xyz](https://app.hyperbolic.xyz)

## Notes

- Free tier allows 60 requests/minute, Pro tier allows 600 requests/minute
- Some models may require Pro tier access
- See [Hyperbolic provider documentation](https://promptfoo.dev/docs/providers/hyperbolic) for detailed configuration options
