# mistral (Azure Mistral Models)

This example demonstrates how to use Mistral models on Azure AI Foundry with promptfoo.

You can run this example with:

```bash
npx promptfoo@latest init --example azure/mistral
```

## Setup

1. Deploy Mistral models in Azure AI Foundry
2. Set your environment variables:

```bash
export AZURE_API_KEY=your-api-key
export AZURE_API_HOST=your-deployment.services.ai.azure.com
```

## Available Mistral Models

| Model                | Description                      |
| -------------------- | -------------------------------- |
| `Mistral-Large-2411` | Mistral Large - Most capable     |
| `Pixtral-Large-2411` | Pixtral Large - Vision + text    |
| `Ministral-3B-2410`  | Ministral 3B - Fast, lightweight |
| `Mistral-Nemo-2407`  | Mistral Nemo - Balanced          |

## Running the Example

```bash
npx promptfoo@latest eval
npx promptfoo@latest view
```

## Configuration

The example compares Mistral Large and Ministral 3B on text generation tasks. This helps evaluate the trade-off between model capacity, speed, and quality.

## Documentation

- [Azure Provider Documentation](https://promptfoo.dev/docs/providers/azure/)
- [Mistral on Azure](https://azure.microsoft.com/en-us/products/ai-services/ai-foundry/)
