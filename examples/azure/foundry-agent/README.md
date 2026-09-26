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
- `timeoutMs` (SDK timeout for each model HTTP request; does not limit callback execution)
- `retryOptions.maxRetries` (SDK retries; defaults to 2)
- `maxToolIterations` (callback batches; defaults to 8, valid range 1–64)

These request-time settings are ignored by the v2 runtime and should be configured on the Foundry agent instead:

- `tool_resources`
- `frequency_penalty`
- `presence_penalty`
- `seed`
- `stop`

Other `retryOptions` fields are unsupported; the SDK controls retry delays and retryable failures.

`maxPollTimeMs` is a cooperative budget starting after the initial response. It is checked between callback batches and model requests, and preserves a final answer that arrives after the budget. It does not interrupt a pending request or callback. Callers using the JavaScript API can cancel with `callApiOptions.abortSignal`; callbacks receive that signal as `context.abortSignal` and should pass it to their own asynchronous operations. A callback that ignores cancellation can continue after the eval stops waiting.

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

## Opt-in live QA from this repository

Use an existing test project and agent. This harness runs text, structured-output, and benign function-tool evals, with at most nine client Responses requests and SDK/scheduler retries disabled. Azure may perform additional model calls internally. Each CLI process has a three-minute wall-clock limit. The harness does not create agents, deployments, or other Azure infrastructure.

From the repository root, preview the configs without contacting Azure:

```bash
npx tsx scripts/azureFoundryLiveQa.ts --dry-run \
  --endpoint https://your-project.services.ai.azure.com/api/projects/your-project \
  --agent your-existing-agent
```

After authenticating with `az login` (or another `DefaultAzureCredential` identity), replace `--dry-run` with `--live`. Each run creates a new local directory containing isolated eval storage and traces, sanitized JSON results, callback counts, and commit/SDK-version metadata. The harness uses the local CLI with `--no-cache`; it stops after a provider error so authentication or endpoint failures do not trigger the rest of the matrix. Timing, cancellation, quota, and transport failure cases remain covered by offline fixtures.
