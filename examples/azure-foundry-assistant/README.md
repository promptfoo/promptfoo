# Azure Foundry Assistant Example

This example demonstrates how to use the Azure Foundry Assistant provider with promptfoo. This provider uses the `@azure/ai-projects` SDK instead of direct HTTP calls to the OpenAI-compatible API.

## Setup

1. Install the required Azure SDK packages:

```bash
npm install @azure/ai-projects @azure/identity
```

2. Set up your Azure credentials. The provider uses `DefaultAzureCredential`, so you can authenticate via:
   - Azure CLI: `az login`
   - Environment variables
   - Managed Identity
   - Service Principal

3. Set your Azure AI Project URL:

```bash
export AZURE_AI_PROJECT_URL="https://your-project.services.ai.azure.com/api/projects/your-project-id"
```

## Configuration

The provider uses the `azure:foundry-assistant:assistant-id` format.

```yaml
providers:
  - azure:foundry-assistant:asst_uRGMedGFDehLkjJJaq51J9GY:
      projectUrl: 'https://faiza-m92xlckl-swedencentral.services.ai.azure.com/api/projects/faiza-m92xlckl-swedence-project'
      config:
        temperature: 0.7
        max_tokens: 150

tests:
  - vars:
      question: 'What is the capital of France?'
    assert:
      - type: contains
        value: 'Paris'
```

## Configuration Options

All the same configuration options from the regular Azure Assistant provider are supported:

- `temperature`: Controls randomness (0.0 to 2.0)
- `max_tokens`: Maximum tokens in response
- `top_p`: Nucleus sampling parameter
- `tools`: Function tools configuration
- `tool_choice`: Tool selection strategy
- `tool_resources`: Resource configuration (file search, etc.)
- `instructions`: System instructions for the assistant
- `functionToolCallbacks`: Custom function callbacks
- `timeoutMs`: Request timeout in milliseconds
- `maxPollTimeMs`: Maximum time to poll for completion
- `retryOptions`: Retry configuration

## Function Tool Callbacks

You can provide custom function callbacks just like with the regular Azure Assistant provider:

```yaml
providers:
  - azure:foundry-assistant:asst_uRGMedGFDehLkjJJaq51J9GY:
      projectUrl: 'https://your-project.services.ai.azure.com/api/projects/your-project-id'
      config:
        functionToolCallbacks:
          getCurrentWeather: |
            (args) => {
              const { location } = JSON.parse(args);
              return `The weather in ${location} is sunny and 75°F`;
            }
```

## Differences from Regular Azure Assistant Provider

The main differences are:

1. **SDK Usage**: Uses `@azure/ai-projects` SDK instead of direct HTTP calls
2. **Authentication**: Uses `DefaultAzureCredential` for Azure authentication
3. **Project URL**: Requires an Azure AI Project URL instead of Azure OpenAI endpoint
4. **Provider Format**: Uses `azure:foundry-assistant:assistant-id` instead of `azure:assistant:assistant-id`

## Environment Variables

- `AZURE_AI_PROJECT_URL`: Your Azure AI Project URL (can be overridden in config)
- Standard Azure credential environment variables (if not using other auth methods)

## Error Handling

The provider includes the same comprehensive error handling as the regular Azure Assistant provider:

- Content filter detection and guardrails reporting
- Rate limit handling
- Service error detection
- Automatic retries for transient errors
