# lambdalabs (Silly Lambda Labs Provider Example)

This example demonstrates how to use the Lambda Labs Inference API with promptfoo to evaluate various Lambda Labs models on their ability to generate kid-friendly, silly explanations of complex concepts.

You can run this example with:

```bash
npx promptfoo@latest init --example lambdalabs
```

## Overview

The Lambda Inference API provides access to cutting-edge large language models like Llama 4, DeepSeek, and Hermes without needing to set up your own infrastructure. This fun example compares how these powerful models handle silly requests and generate child-friendly explanations.

## Prerequisites

- A Lambda Labs Cloud account
- A Lambda Labs API key (generate from your [Lambda Cloud dashboard](https://cloud.lambdalabs.com/api-keys))

## Environment Variables

This example requires the following environment variables:

- `LAMBDA_API_KEY` - Your Lambda Labs Cloud API key
- `OPENAI_API_KEY` - Required for the custom grading model (uses GPT-4o-mini)

You can set these in a `.env` file or directly in your environment:

```bash
export LAMBDA_API_KEY=your_lambda_key_here
export OPENAI_API_KEY=your_openai_key_here
```

## Running the Example

1. Set the required environment variables
2. Run the evaluation:

```bash
promptfoo eval
```

3. View the results in the web UI:

```bash
promptfoo view
```

## What This Example Demonstrates

- How to configure the Lambda Labs provider
- How to use language models for generating kid-friendly, fun content
- How to compare multiple models from Lambda Labs on creativity metrics
- How to set up custom grading prompts that evaluate outputs based on humor and creativity
- How to create more engaging and fun evaluations for LLM outputs

## Model Information

This example uses the following models:

- `llama-4-maverick-17b-128e-instruct-fp8` - Meta's Llama 4 Maverick model with 128 expert MoE architecture
- `llama3.3-70b-instruct-fp8` - Meta's Llama 3.3 70B parameter model

Lambda Labs offers many other models that you can try by changing the model name in the configuration file.

## Custom Grading

This example showcases how to use custom grading with a pirate-themed "Captain Giggles" LLM evaluator that assesses:

1. Silliness and absurdity 
2. Kid-friendliness
3. Creativity of analogies
4. Quality of jokes

## Customization

You can modify this example to:

- Test different Lambda Labs models
- Change the silly themes and topics
- Adjust the grading criteria and rubric prompts
- Experiment with different temperature settings to control randomness

## Additional Resources

- [Lambda Labs API Documentation](https://docs.lambdalabs.com/api)
- [promptfoo Lambda Labs Provider Documentation](https://promptfoo.dev/docs/providers/lambdalabs)
- [Model-graded Metrics Documentation](https://promptfoo.dev/docs/configuration/expected-outputs/model-graded/)
- [More promptfoo Examples](https://promptfoo.dev/docs/examples) 