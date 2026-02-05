# deepseek (Azure DeepSeek Models)

This example demonstrates how to use DeepSeek models on Azure AI Foundry with promptfoo, including the DeepSeek-R1 reasoning model.

You can run this example with:

```bash
npx promptfoo@latest init --example azure/deepseek
```

## Setup

1. Deploy DeepSeek models in Azure AI Foundry
2. Set your environment variables:

```bash
export AZURE_API_KEY=your-api-key
export AZURE_API_HOST=your-deployment.services.ai.azure.com
```

## Available DeepSeek Models

| Model                           | Type      | Description               |
| ------------------------------- | --------- | ------------------------- |
| `DeepSeek-R1`                   | Reasoning | Advanced reasoning model  |
| `DeepSeek-V3`                   | Chat      | Standard chat model       |
| `DeepSeek-R1-Distill-Llama-70B` | Reasoning | Distilled reasoning model |
| `DeepSeek-R1-Distill-Qwen-32B`  | Reasoning | Distilled reasoning model |

## Reasoning Model Configuration

DeepSeek-R1 is a reasoning model that requires special configuration:

```yaml
providers:
  - id: azure:chat:DeepSeek-R1
    config:
      isReasoningModel: true # Required for reasoning models
      max_completion_tokens: 4096 # Use instead of max_tokens
      reasoning_effort: medium # low, medium, or high
```

## Running the Example

```bash
npx promptfoo@latest eval
npx promptfoo@latest view
```

## Documentation

- [Azure Provider Documentation](https://promptfoo.dev/docs/providers/azure/)
- [DeepSeek on Azure](https://azure.microsoft.com/en-us/products/ai-services/ai-foundry/)
