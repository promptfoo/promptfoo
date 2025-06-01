# hyperbolic-multimodal

This example demonstrates Hyperbolic's AI capabilities across four key areas:

1. **Reasoning Models** - Advanced problem-solving and logical reasoning
2. **Image Generation** - Text-to-image generation with multiple models
3. **Audio Generation** - Text-to-speech synthesis
4. **Multimodal Understanding** - Vision-language models for image analysis

## Prerequisites

1. Get your Hyperbolic API key from [https://app.hyperbolic.xyz](https://app.hyperbolic.xyz)
2. Set the environment variable:
   ```bash
   export HYPERBOLIC_API_KEY=your_api_key_here
   ```

## Important Notes

- **DeepSeek-R1 Access**: The DeepSeek-R1 model requires a "pro" or higher role on Hyperbolic. If you encounter 401 Unauthorized errors, you may need to upgrade your account or use alternative models like QwQ-32B or Llama-70B.
- **API Key**: Make sure your `HYPERBOLIC_API_KEY` environment variable is set before running the examples.
- **Model Availability**: Some models may have limited availability or require specific account permissions.

## Running the Examples

You can run this example with:

```bash
npx promptfoo@latest init --example hyperbolic-multimodal
```

Or run individual configurations:

```bash
# Quick test (recommended first)
npx promptfoo eval -c quick-test.yaml

# Test reasoning capabilities
npx promptfoo eval -c reasoning.yaml

# Test image generation
npx promptfoo eval -c image-generation.yaml

# Test audio generation (TTS)
npx promptfoo eval -c audio-generation.yaml

# Test multimodal vision-language models
npx promptfoo eval -c multimodal.yaml

# View results in the web UI
npx promptfoo view
```

## Testing the API

Before running the full examples, you can test if your API key works:

```bash
./test-api.sh
```

## Configuration Files

### 1. quick-test.yaml - Basic Functionality Test

Simple test to verify your setup works with basic text generation.

Model tested:
- `hyperbolic:meta-llama/Llama-3.1-8B` - Fast, small model for quick testing

### 2. reasoning.yaml - Reasoning Models

Tests advanced reasoning capabilities across:

- **Logic Puzzles**: River crossing, weighing problems
- **Mathematical Reasoning**: Proofs and word problems
- **Code Reasoning**: Algorithm analysis and optimization

Models tested:
- `hyperbolic:deepseek-ai/DeepSeek-R1` - Advanced reasoning model (requires pro account)
- `hyperbolic:qwen/QwQ-32B` - Qwen reasoning model
- `hyperbolic:meta-llama/Llama-3.1-70B` - General purpose LLM

### 3. image-generation.yaml - Image Generation

Tests image generation across different styles:

- **Artistic Styles**: Watercolor, digital art
- **Photorealistic**: Portraits, macro photography
- **Fantasy/Sci-fi**: Dragons, space exploration

Models tested:
- `hyperbolic:image:Flux.1-dev` - State-of-the-art image generation
- `hyperbolic:image:SDXL1.0-base` - Stable Diffusion XL
- `hyperbolic:image:SD1.5` - Classic Stable Diffusion

### 4. audio-generation.yaml - Audio Generation (TTS)

Tests text-to-speech synthesis across different types of content:

- **Short Phrases**: Simple greetings and sentences
- **Technical Content**: AI and technology topics
- **Longer Content**: Paragraphs and detailed descriptions
- **Numbers & Punctuation**: Addresses and phone numbers

Model tested:
- `hyperbolic:audio:Melo-TTS` - High-quality text-to-speech

### 5. multimodal.yaml - Vision-Language Models

Tests multimodal understanding:

- **Image Analysis**: Describing scenes and subjects
- **Chart Understanding**: Interpreting diagrams
- **Text Extraction**: Reading text from images

Models tested:
- `hyperbolic:qwen/Qwen2.5-VL-72B-Instruct` - Qwen vision-language model
- `hyperbolic:mistralai/Pixtral-12B` - Mistral's multimodal model

## Key Features Demonstrated

1. **Reasoning Token Tracking**: DeepSeek-R1 and QwQ models support detailed reasoning token metrics
2. **Multiple Image Formats**: Support for various image generation styles and resolutions
3. **Audio Synthesis**: High-quality text-to-speech with natural voice
4. **Multimodal Inputs**: Combining text and image inputs for vision-language tasks
5. **Cost Tracking**: Automatic cost calculation for all API calls

## Tips

- For reasoning tasks, use lower temperatures (0.1) for more deterministic outputs
- Image generation quality improves with higher step counts and cfg_scale values
- Vision-language models work best with clear, high-resolution images
- Use the `--no-cache` flag when testing to ensure fresh API calls
- Start with `quick-test.yaml` to verify your setup before running larger examples

## Troubleshooting

- **API Key Issues**: Ensure `HYPERBOLIC_API_KEY` is set correctly
- **401 Unauthorized**: Some models (like DeepSeek-R1) require upgraded account permissions
- **Image Generation**: Different models support different resolutions
- **Rate Limits**: Add delays between tests if hitting rate limits
- **Audio Output**: Audio responses are returned as base64-encoded data

## Further Reading

- [Hyperbolic Documentation](https://docs.hyperbolic.xyz)
- [Promptfoo Documentation](https://promptfoo.dev/docs)
- [Model Pricing](https://hyperbolic.xyz/pricing)
