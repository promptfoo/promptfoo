# azure (Azure AI Examples)

This directory contains examples for using Azure AI services with promptfoo, including Azure OpenAI, Azure AI Foundry, and third-party models available through Microsoft Foundry.

## Available Examples

### Azure OpenAI

| Example                           | Description                         |
| --------------------------------- | ----------------------------------- |
| [openai](./openai/)               | Azure OpenAI chat and vision models |
| [assistant](./assistant/)         | Azure OpenAI Assistants with tools  |
| [foundry-agent](./foundry-agent/) | Azure AI Foundry Agents             |

### Third-Party Models (Azure AI Foundry)

| Example                     | Description                                   |
| --------------------------- | --------------------------------------------- |
| [claude](./claude/)         | Anthropic Claude models (Opus, Sonnet, Haiku) |
| [llama](./llama/)           | Meta Llama models (4, 3.3, 3.1)               |
| [deepseek](./deepseek/)     | DeepSeek models including R1 reasoning        |
| [mistral](./mistral/)       | Mistral models (Large, Ministral)             |
| [comparison](./comparison/) | Compare models across providers               |

## Quick Start

```bash
# Azure OpenAI basic example
npx promptfoo@latest init --example azure/openai

# Azure Assistants with tools
npx promptfoo@latest init --example azure/assistant

# Azure AI Foundry Agents
npx promptfoo@latest init --example azure/foundry-agent

# Third-party models
npx promptfoo@latest init --example azure/claude
npx promptfoo@latest init --example azure/llama
npx promptfoo@latest init --example azure/deepseek
npx promptfoo@latest init --example azure/mistral
npx promptfoo@latest init --example azure/comparison
```

## Environment Variables

All Azure examples require authentication. Set one of:

```bash
# Option 1: API Key (simplest)
export AZURE_API_KEY=your-api-key
export AZURE_API_HOST=your-resource.openai.azure.com

# Option 2: Azure CLI (recommended for development)
az login

# Option 3: Service Principal
export AZURE_CLIENT_ID=your-client-id
export AZURE_CLIENT_SECRET=your-client-secret
export AZURE_TENANT_ID=your-tenant-id
```

## Documentation

- [Azure Provider Documentation](https://promptfoo.dev/docs/providers/azure/)
- [Azure OpenAI Service](https://learn.microsoft.com/en-us/azure/ai-services/openai/)
- [Azure AI Foundry](https://learn.microsoft.com/en-us/azure/ai-foundry/)
