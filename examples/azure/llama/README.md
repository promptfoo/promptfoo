# llama (Azure Llama Models)

This example demonstrates how to use Meta Llama models on Azure AI Foundry with promptfoo.

You can run this example with:

```bash
npx promptfoo@latest init --example azure/llama
```

## Setup

1. Deploy Llama models in Azure AI Foundry
2. Set your environment variables:

```bash
export AZURE_API_KEY=your-api-key
export AZURE_API_HOST=your-deployment.services.ai.azure.com
```

## Available Llama Models

| Model                                    | Description                         |
| ---------------------------------------- | ----------------------------------- |
| `Llama-4-Maverick-17B-128E-Instruct-FP8` | Llama 4 Maverick (128 experts, FP8) |
| `Llama-4-Scout-17B-16E-Instruct`         | Llama 4 Scout (16 experts)          |
| `Llama-3.3-70B-Instruct`                 | Llama 3.3 70B                       |
| `Meta-Llama-3.1-405B-Instruct`           | Llama 3.1 405B                      |
| `Meta-Llama-3.1-70B-Instruct`            | Llama 3.1 70B                       |
| `Meta-Llama-3.1-8B-Instruct`             | Llama 3.1 8B                        |

## Running the Example

```bash
npx promptfoo@latest eval
npx promptfoo@latest view
```

## Configuration

The example compares Llama 4 Maverick and Llama 4 Scout on code generation tasks. This helps evaluate the trade-off between model capacity (expert count), speed, and quality.

## Documentation

- [Azure Provider Documentation](https://promptfoo.dev/docs/providers/azure/)
- [Llama on Azure](https://azure.microsoft.com/en-us/products/ai-services/ai-foundry/)
