# comparison (Azure Model Comparison)

This example demonstrates how to compare models from different providers on Azure AI Foundry, including OpenAI, Anthropic Claude, Meta Llama, and Mistral.

You can run this example with:

```bash
npx promptfoo@latest init --example azure/comparison
```

## Setup

1. Deploy models from different providers in Azure AI Foundry
2. Set your environment variables:

```bash
# For Azure OpenAI models
export AZURE_API_KEY=your-azure-openai-key
export AZURE_API_HOST=your-resource.openai.azure.com

# For third-party models (Claude, Llama, Mistral)
export AZURE_AI_HOST=your-deployment.services.ai.azure.com
```

## Models Compared

| Provider | Model | Label |
|----------|-------|-------|
| OpenAI | `gpt-4.1` | gpt-4.1 |
| Anthropic | `claude-sonnet-4-5-20250929` | claude-sonnet |
| Meta | `Llama-3.3-70B-Instruct` | llama-3.3 |
| Mistral | `Mistral-Large-2411` | mistral-large |

## Running the Example

```bash
npx promptfoo@latest eval
npx promptfoo@latest view
```

## Customization

Modify `promptfooconfig.yaml` to:

- Add or remove models
- Change test questions
- Adjust evaluation criteria
- Compare cost vs performance

## Use Cases

- Benchmark different models on your specific tasks
- Evaluate cost-effectiveness across providers
- Find the best model for your use case
- A/B test model updates

## Documentation

- [Azure Provider Documentation](https://promptfoo.dev/docs/providers/azure/)
- [Azure AI Foundry](https://azure.microsoft.com/en-us/products/ai-services/ai-foundry/)
