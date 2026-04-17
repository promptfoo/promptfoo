# replicate-llama4-scout (Replicate Llama 4 Scout)

You can run this example with:

```bash
npx promptfoo@latest init --example replicate-llama4-scout
```

This example demonstrates how to use Replicate to run the new **Llama 4 Scout** model, a cutting-edge 17 billion parameter model with 16 experts using mixture-of-experts architecture.

## About Llama 4 Scout

[Llama 4 Scout](https://replicate.com/meta/llama-4-scout-instruct) is part of the Llama 4 collection of natively multimodal AI models. Key features:

- **17 billion parameters** with **16 experts**
- **Mixture-of-experts architecture** for enhanced performance
- **Natively multimodal** - enables text and multimodal experiences
- **Industry-leading performance** in text and image understanding

## Environment Variables

This example requires the following environment variable:

- `REPLICATE_API_TOKEN` - Your Replicate API key (get one at https://replicate.com/account/api-tokens)

You can set this in a `.env` file or directly in your environment:

```bash
export REPLICATE_API_TOKEN=your_api_token_here
```

## What This Example Does

This example:

- Tests the Llama 4 Scout model on various analytical and creative tasks
- Demonstrates the model's advanced reasoning capabilities
- Compares Llama 4 Scout with Llama 3 to show improvements
- Shows how to configure Replicate model parameters for optimal results

## Running the Example

1. Set your Replicate API token (see above)
2. Run the evaluation:

```bash
promptfoo eval
```

3. View the results:

```bash
promptfoo view
```

## Model Configuration

The example demonstrates key Replicate configuration options for Llama 4:

- `temperature`: Controls randomness (0.0 = deterministic, 1.0 = very random)
- `max_tokens`: Maximum number of tokens to generate
- `top_p`: Nucleus sampling threshold for token selection

## Test Cases

The example includes tests for:

- **AI and mixture-of-experts architecture** - Testing the model's self-awareness
- **Multimodal AI** - Exploring the model's understanding of multimodal capabilities
- **Quantum computing** - Complex technical topics
- **Climate solutions** - Practical problem-solving
- **Creative writing** - Narrative and storytelling abilities

## Customizing the Example

You can modify this example to:

- Test Llama 4 Maverick (128 experts) when available
- Add image understanding tests (when multimodal features are enabled)
- Compare against other state-of-the-art models
- Explore the mixture-of-experts architecture's impact on different tasks

## Notes

- Llama 4 Scout uses a mixture-of-experts approach for efficient computation
- The model excels at both analytical and creative tasks
- Response quality benefits from the 16-expert architecture
- Part of the Llama 4 ecosystem with multimodal capabilities
