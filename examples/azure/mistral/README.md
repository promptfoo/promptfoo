# mistral (Azure Mistral Models)

This example demonstrates how to use Mistral models on Azure AI Foundry with promptfoo.

You can run this example with:

```bash
npx promptfoo@latest init --example azure/mistral
```

## Setup

1. Deploy Mistral models in Azure AI Foundry
2. Update `promptfooconfig.yaml` with your deployment name and API host
3. Set your environment variables:

```bash
export AZURE_API_KEY=your-api-key
```

## Available Mistral Models

| Model                | Description                      |
| -------------------- | -------------------------------- |
| `Mistral-Large-3`    | Mistral Large 3 - Most capable   |
| `Mistral-Large-2411` | Mistral Large - Previous gen     |
| `mistral-small-2503` | Mistral Small - Fast, efficient  |
| `Pixtral-Large-2411` | Pixtral Large - Vision + text    |
| `Ministral-3B-2410`  | Ministral 3B - Fast, lightweight |
| `Mistral-Nemo`       | Mistral Nemo - Balanced          |

## Running the Example

```bash
npx promptfoo@latest eval
npx promptfoo@latest view
```

## Configuration

The example compares Mistral Large 3 and Mistral Small 2503 on text generation tasks. This helps evaluate the trade-off between model capacity, speed, and quality.

## Documentation

- [Azure Provider Documentation](https://promptfoo.dev/docs/providers/azure/)
- [Mistral on Azure](https://azure.microsoft.com/en-us/products/ai-services/ai-foundry/)
