# lambdalabs (Lambda Labs Provider Example)

This example demonstrates how to use the Lambda Labs Inference API with promptfoo to evaluate various Lambda Labs models, including Llama 4 and Llama 3.3.

You can run this example with:

```bash
npx promptfoo@latest init --example lambdalabs
```

## Overview

The Lambda Inference API provides access to cutting-edge large language models like Llama 4, DeepSeek, and Hermes without needing to set up your own infrastructure. This example compares the performance of different Lambda Labs models on a variety of topics.

## Prerequisites

- A Lambda Labs Cloud account
- A Lambda Labs API key (generate from your [Lambda Cloud dashboard](https://cloud.lambdalabs.com/api-keys))

## Environment Variables

This example requires the following environment variables:

- `LAMBDA_API_KEY` - Your Lambda Labs Cloud API key

You can set this in a `.env` file or directly in your environment:

```bash
export LAMBDA_API_KEY=your_api_key_here
```

## Running the Example

1. Set the required environment variable
2. Run the evaluation:

```bash
promptfoo eval --config examples/lambdalabs/config.yaml
```

3. View the results in the web UI:

```bash
promptfoo view
```

## What This Example Demonstrates

- How to configure the Lambda Labs provider
- How to use the chat completion interface with text prompts
- How to compare multiple models from Lambda Labs
- How to set up assertions for evaluating model responses

## Model Information

This example uses the following models:

- `llama-4-maverick-17b-128e-instruct-fp8` - Meta's Llama 4 Maverick model with 128 expert MoE architecture
- `llama3.3-70b-instruct-fp8` - Meta's Llama 3.3 70B parameter model

Lambda Labs offers many other models that you can try by changing the model name in the configuration file.

## Customization

You can modify this example to:

- Test different Lambda Labs models
- Compare Lambda Labs models with other providers
- Evaluate different topics and concepts
- Add more sophisticated assertions

## Additional Resources

- [Lambda Labs API Documentation](https://docs.lambdalabs.com/api)
- [promptfoo Lambda Labs Provider Documentation](https://promptfoo.dev/docs/providers/lambdalabs)
- [More promptfoo Examples](https://promptfoo.dev/docs/examples) 