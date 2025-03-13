# azure-openai (Azure OpenAI Integration)

This example demonstrates how to use Azure OpenAI with promptfoo.

## Environment Variables

This example requires the following environment variables:

- `AZURE_API_KEY` - Your Azure OpenAI API key
- `AZURE_OPENAI_API_KEY` - Alternative environment variable for your Azure OpenAI API key

You can set these in a `.env` file or directly in your environment.

## Prerequisites

1. An Azure account with access to Azure OpenAI Service
2. Deployments for one or more azure openai models (e.g., gpt-4o, o3-mini - you can change the deployment names in the config)
3. Your Azure OpenAI endpoint URL

## Setup Instructions

1. Update the `apiHost` in the configuration to your Azure OpenAI endpoint
2. Set `AZURE_API_KEY` in your environment
3. Update the deployment names to match your actual deployments in `promptfooconfig.yaml`

## Running the Example

You can run this example with:

```bash
npx promptfoo@latest init --example azure-openai
cd azure-openai
npx promptfoo@latest eval
```

Or if you've already cloned the repository:

```bash
cd examples/azure-openai
promptfoo eval
```

## Additional Resources

- [Azure OpenAI Provider Documentation](https://promptfoo.dev/docs/providers/azure/)
- [Azure OpenAI Service Documentation](https://learn.microsoft.com/en-us/azure/ai-services/openai/)
