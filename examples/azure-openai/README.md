# azure-openai (Azure OpenAI Integration)

This example demonstrates how to use Azure OpenAI with promptfoo, including support for reasoning models.

## Environment Variables

This example requires the following environment variables:

- `AZURE_API_KEY` - Your Azure OpenAI API key
- `AZURE_OPENAI_API_KEY` - Alternative environment variable for your Azure OpenAI API key

You can set these in a `.env` file or directly in your environment.

## Features

- Using the `azure:chat` provider format with a deployment name
- Setting API host via configuration
- Using embeddings via Azure for similarity comparison
- **Working with reasoning models** (o1, o3-mini) using the `isReasoningModel` flag
- Comparing standard and reasoning model outputs on complex problems

## Prerequisites

1. An Azure account with access to Azure OpenAI Service
2. Deployments for both standard models (e.g., gpt-35-turbo) and reasoning models (e.g., o3-mini)
3. Your Azure OpenAI endpoint URL

## Setup Instructions

1. Update the `apiHost` in the configuration to your Azure OpenAI endpoint
2. Set `AZURE_API_KEY` in your environment
3. Update the deployment names to match your actual deployments

## Using Reasoning Models

This example shows how to use reasoning models (o1, o3-mini) with Azure OpenAI:

1. Set the `isReasoningModel: true` flag
2. Use `max_completion_tokens` instead of `max_tokens`
3. Set the `reasoning_effort` parameter as needed ('low', 'medium', 'high')

Reasoning models excel at complex problem-solving tasks that require step-by-step thinking, such as:

- Mathematical proofs
- Complex reasoning chains
- Multi-step problem solving
- Code generation and analysis

## Expected Results

When running this example, you'll see:

- Interesting facts generated about various topics
- Solutions to complex problems with step-by-step reasoning
- Performance metrics comparing standard and reasoning models
- Similarity comparisons using Azure embeddings

## Running the Example

You can run this example with:

```bash
npx promptfoo@latest init --example azure-openai
```

Or if you've already cloned the repository:

```bash
cd examples/azure-openai
promptfoo eval
```

## Additional Resources

- [Azure OpenAI Provider Documentation](https://promptfoo.dev/docs/providers/azure/)
- [Azure OpenAI Service Documentation](https://learn.microsoft.com/en-us/azure/ai-services/openai/)
- [Reasoning Models Overview](https://platform.openai.com/docs/models/reasoning-engines)
