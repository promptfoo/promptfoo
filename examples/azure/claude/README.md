# azure/claude (Azure Claude Models)

This example demonstrates how to use Anthropic Claude models on Azure AI Foundry with promptfoo.

You can run this example with:

```bash
npx promptfoo@latest init --example azure/claude
cd azure/claude
```

## Setup

1. Deploy Claude models in Azure AI Foundry
2. Set your environment variables:

```bash
export AZURE_API_KEY=your-api-key
export AZURE_API_HOST=your-deployment.services.ai.azure.com
```

## Available Claude Models

| Model                       | Description                  |
| --------------------------- | ---------------------------- |
| `claude-opus-5`             | Claude Opus 5 - Most capable |
| `claude-sonnet-5`           | Claude Sonnet 5 - Balanced   |
| `claude-haiku-4-5-20251001` | Claude Haiku 4.5 - Fast      |

## Running the Example

```bash
npx promptfoo@latest eval
npx promptfoo@latest view
```

## Configuration

The example compares Claude Opus 5, Claude Sonnet 5, and Claude Haiku 4.5 on explanation tasks. Modify `promptfooconfig.yaml` to:

- Change models by updating the provider IDs
- Adjust `max_tokens` (Opus 5 and Sonnet 5 reject `temperature`/`top_p`/`top_k`; use `effort` instead)
- Add more test cases

## Documentation

- [Azure Provider Documentation](https://promptfoo.dev/docs/providers/azure/)
- [Claude on Azure](https://azure.microsoft.com/en-us/products/ai-services/ai-foundry/)
