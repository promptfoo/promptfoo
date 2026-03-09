# azure/foundry-agent (Azure AI Foundry Agent)

This example demonstrates how to use the Azure Foundry Agent provider with promptfoo. This provider uses the `@azure/ai-projects` SDK and the v2 Responses agent runtime instead of the old threads/runs API.

You can run this example with:

```bash
npx promptfoo@latest init --example azure/foundry-agent
cd azure/foundry-agent
```

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

The provider uses the `azure:foundry-agent:agent-name-or-id` format. Agent names are preferred. Legacy agent IDs still work as a fallback lookup if the agent exists in the project.

```yaml
providers:
  - id: azure:foundry-agent:my-foundry-agent
    config:
      projectUrl: 'https://your-project.services.ai.azure.com/api/projects/your-project-id'
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

These per-request settings are supported:

- `instructions`
- `temperature`
- `top_p`
- `max_tokens` / `max_completion_tokens` (mapped to `max_output_tokens`)
- `response_format`
- `tools`
- `tool_choice`
- `functionToolCallbacks`
- `modelName`
- `reasoning_effort`
- `verbosity`
- `metadata`
- `passthrough`
- `maxPollTimeMs`

These request-time settings are ignored by the v2 runtime and should be configured on the Foundry agent instead:

- `tool_resources`
- `frequency_penalty`
- `presence_penalty`
- `seed`
- `stop`
- `timeoutMs`
- `retryOptions`

## Function Tool Callbacks

You can provide custom function callbacks just like with the regular Azure Assistant provider:

```yaml
providers:
  - id: azure:foundry-agent:my-foundry-agent
    config:
      projectUrl: 'https://your-project.services.ai.azure.com/api/projects/your-project-id'
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
4. **Provider Format**: Uses `azure:foundry-agent:agent-name-or-id` instead of `azure:assistant:assistant-id`
5. **Runtime**: Uses `responses.create(..., agent_reference)` instead of threads/messages/runs

## Environment Variables

- `AZURE_AI_PROJECT_URL`: Your Azure AI Project URL (can be overridden in config)
- Standard Azure credential environment variables (if not using other auth methods)

## Error Handling

The provider includes the same comprehensive error handling as the regular Azure Assistant provider:

- Content filter detection and guardrails reporting
- Rate limit handling
- Service error detection
- Automatic retries for transient errors
