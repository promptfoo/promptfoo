# replicate-llama2 (Replicate Llama)

You can run this example with:

```bash
npx promptfoo@latest init --example replicate-llama2
```

This example demonstrates how to use Replicate to run and compare different Llama models for content generation tasks.

## Environment Variables

This example requires the following environment variable:

- `REPLICATE_API_TOKEN` - Your Replicate API key (get one at https://replicate.com/account/api-tokens)

You can set this in a `.env` file or directly in your environment:

```bash
export REPLICATE_API_TOKEN=your_api_token_here
```

## What This Example Does

This example:

- Tests two different Llama 3 models (8B and 70B variants)
- Generates viral social media content for different topics
- Compares the quality and style of outputs between models
- Demonstrates how to configure Replicate model parameters

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

The example demonstrates key Replicate configuration options:

- `temperature`: Controls randomness (0.0 = deterministic, 1.0 = very random)
- `max_new_tokens`: Maximum number of tokens to generate
- `top_p`: Nucleus sampling threshold for token selection

## Customizing the Example

You can modify this example to:

- Test different Replicate models (see https://replicate.com/explore)
- Adjust generation parameters for different use cases
- Add more test cases with specific assertions
- Compare against other providers like OpenAI or Anthropic

## Notes

- The Llama 3 8B model is faster and more cost-effective for simple tasks
- The Llama 3 70B model provides higher quality outputs for complex tasks
- Response times vary based on model size and server availability
