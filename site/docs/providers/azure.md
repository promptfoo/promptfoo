---
sidebar_position: 4
title: Azure OpenAI Provider
description: Configure and use Azure OpenAI models with promptfoo for evals, including GPT-4, reasoning models, assistants, Azure AI Foundry, and vision capabilities
keywords: [azure, openai, gpt-4, vision, reasoning models, assistants, azure ai foundry, evaluation]
---

# Azure

The `azure` provider enables you to use Azure OpenAI Service models with Promptfoo. It shares configuration settings with the [OpenAI provider](/docs/providers/openai).

## Setup

There are three ways to authenticate with Azure OpenAI:

### Option 1: API Key Authentication

Set the `AZURE_API_KEY` environment variable and configure your deployment:

```yaml
providers:
  - id: azure:chat:deploymentNameHere
    config:
      apiHost: 'xxxxxxxx.openai.azure.com'
```

### Option 2: Client Credentials (Service Principal) Authentication {#service-principal}

Use an Azure Entra ID (formerly Azure AD) **Service Principal** instead of an API key. This is the recommended approach for production environments, CI/CD pipelines, and any scenario where you want to avoid managing API keys directly.

You'll need three values from your Service Principal's app registration in the [Azure Portal](https://portal.azure.com):

- **Client ID** – the Application (client) ID of your app registration
- **Client Secret** – a secret generated under _Certificates & secrets_
- **Tenant ID** – your Azure AD / Entra ID directory (tenant) ID

Set them as environment variables:

```bash
export AZURE_CLIENT_ID="your-application-client-id"
export AZURE_CLIENT_SECRET="your-client-secret-value"
export AZURE_TENANT_ID="your-directory-tenant-id"
```

Or set them in the provider `config` (see [full example below](#using-client-credentials)):

- `azureClientId`
- `azureClientSecret`
- `azureTenantId`

If no API key is configured and only some service principal values are set, the Azure OpenAI providers warn and fall back to Azure CLI credentials. Foundry Agent uses the Azure SDK's default credential chain instead.

Optionally, you can also set:

- `AZURE_AUTHORITY_HOST` / `azureAuthorityHost` (defaults to `https://login.microsoftonline.com`)
- `AZURE_TOKEN_SCOPE` / `azureTokenScope` (defaults to `https://cognitiveservices.azure.com/.default`)

Then configure your deployment:

```yaml
providers:
  - id: azure:chat:deploymentNameHere
    config:
      apiHost: 'xxxxxxxx.openai.azure.com'
```

:::tip

The Service Principal must have the **Cognitive Services OpenAI User** role (or equivalent) assigned on your Azure OpenAI resource. You can assign this in the Azure Portal under your resource's **Access control (IAM)** blade.

:::

### Option 3: Azure CLI Authentication

Authenticate with Azure CLI using `az login` before running promptfoo. This is the fallback option if the parameters for the previous options are not provided.

Optionally, you can also set:

- `AZURE_TOKEN_SCOPE` / `azureTokenScope` (defaults to 'https://cognitiveservices.azure.com/.default')

Then configure your deployment:

```yaml
providers:
  - id: azure:chat:deploymentNameHere
    config:
      apiHost: 'xxxxxxxx.openai.azure.com'
```

## Provider Types

- `azure:chat:<deployment name>` - For chat endpoints (e.g., gpt-6-sol, gpt-6-luna, gpt-5.6-terra, gpt-5.4, gpt-4o)
- `azure:completion:<deployment name>` - For completion endpoints (e.g., gpt-35-turbo-instruct)
- `azure:embedding:<deployment name>` - For embedding models (e.g., text-embedding-3-small, text-embedding-3-large)
- `azure:responses:<deployment name>` - For the Responses API (e.g., gpt-6-astra, gpt-6-sol, gpt-6-luna, gpt-5.6-terra, gpt-4.1)
- `azure:realtime:<deployment name>` - For GA Realtime API deployments (e.g., gpt-realtime-1.5-2026-02-23)
- `azure:assistant:<assistant id>` - Legacy Azure OpenAI Assistants (retired August 26, 2026)
- `azure:foundry-agent:<agent name or id>` - For Azure AI Foundry Agents (using Azure AI Projects SDK)
- `azure:video:<deployment name>` - For video generation (Sora)
- `azure:image:<deployment name>` - For Microsoft MAI image generation (e.g., MAI-Image-2.6) — see [Using Microsoft MAI Models](#using-microsoft-mai-models)

Vision-capable GPT-6, GPT-5, GPT-4o, and GPT-4.1 deployments use the standard `azure:chat:` provider type.

Azure deployment availability changes frequently and varies by region. Check the
[Azure OpenAI model availability page](https://learn.microsoft.com/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure)
for the current list of supported models and regions before creating new deployments.

## Available Models

Azure provides access to OpenAI models as well as third-party models through Azure AI Foundry (Microsoft Foundry).

### OpenAI Models

| Category             | Models                                                                                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GPT-6 Series**     | `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`                                                                                                                                                                          |
| **GPT-5 Series**     | `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.4`, `gpt-5.4-pro`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5`, `gpt-5-pro`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5.1`, `gpt-5.1-chat`, `gpt-5.1-codex` |
| **GPT-4.1 Series**   | `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`                                                                                                                                                                         |
| **GPT-4o Series**    | `gpt-4o`, `gpt-4o-mini`, `gpt-4o-realtime`                                                                                                                                                                        |
| **Reasoning Models** | `o1`, `o1-mini`, `o1-pro`, `o3`, `o3-mini`, `o3-pro`, `o4-mini`                                                                                                                                                   |
| **Specialized**      | `computer-use-preview`, `gpt-image-1`, `codex-mini-latest`                                                                                                                                                        |
| **Deep Research**    | `o3-deep-research`, `o4-mini-deep-research`                                                                                                                                                                       |
| **Embeddings**       | `text-embedding-3-small`, `text-embedding-3-large`, `text-embedding-ada-002`                                                                                                                                      |

### Third-Party Models (Azure AI Foundry)

Azure AI Foundry provides access to models from multiple providers:

| Provider             | Models                                                                                                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Anthropic Claude** | Opus, Sonnet, Haiku, Fable, and Mythos — see [Using Claude Models](#using-claude-models) for model IDs and deployment details                                                                                                                                                               |
| **Meta Llama**       | `Llama-4-Scout-17B-16E-Instruct`, `Llama-4-Maverick-17B-128E-Instruct-FP8`, `Llama-3.3-70B-Instruct`, `Meta-Llama-3.1-405B-Instruct`, `Meta-Llama-3.1-70B-Instruct`, `Meta-Llama-3.1-8B-Instruct`                                                                                           |
| **DeepSeek**         | `DeepSeek-R1` (reasoning), `DeepSeek-V3`, `DeepSeek-R1-Distill-Llama-70B`, `DeepSeek-R1-Distill-Qwen-32B`                                                                                                                                                                                   |
| **Mistral**          | `Mistral-Large-2411`, `Pixtral-Large-2411`, `Ministral-3B-2410`, `Mistral-Nemo-2407`                                                                                                                                                                                                        |
| **Cohere**           | `Cohere-command-a-03-2025`, `command-r-plus-08-2024`, `command-r-08-2024`                                                                                                                                                                                                                   |
| **Microsoft MAI**    | Image (Preview) via `azure:image`: `MAI-Image-2.6`, `MAI-Image-2.6-Flash`, `MAI-Image-2.5`, `MAI-Image-2.5-Flash`. Chat via `azure:chat`: `MAI-DS-R1` (deprecated), `MAI-Thinking-1` / `MAI-Code-1-Flash` (private preview) — see [Using Microsoft MAI Models](#using-microsoft-mai-models) |
| **Microsoft Phi**    | `Phi-4`, `Phi-4-mini-instruct`, `Phi-4-reasoning`, `Phi-4-mini-reasoning`                                                                                                                                                                                                                   |
| **xAI Grok**         | `grok-3`, `grok-3-mini`, `grok-3-reasoning`, `grok-3-mini-reasoning`, `grok-2-vision-1212`                                                                                                                                                                                                  |
| **AI21**             | `AI21-Jamba-1.5-Large`, `AI21-Jamba-1.5-Mini`                                                                                                                                                                                                                                               |
| **Core42**           | `JAIS-70b-chat`, `Falcon3-7B-Instruct`                                                                                                                                                                                                                                                      |

For the complete list of models with pricing, see the [Microsoft Foundry model catalog](https://azure.microsoft.com/en-us/products/ai-foundry).

### GPT-6 on Azure

Azure supports `gpt-6-astra`, `gpt-6-sol`, and `gpt-6-luna` through Chat Completions and Responses. Use your deployment name with `azure:chat:` or `azure:responses:`. Check the [Azure model catalog](https://learn.microsoft.com/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure#gpt-6) for availability.

For a deployment name that does not identify its underlying model, set `config.modelName` to `gpt-6-astra`, `gpt-6-sol`, or `gpt-6-luna` so Promptfoo applies the model's request rules. Sol and Luna require `reasoning_effort: none` for Chat function tools; use Responses for tools with reasoning enabled or with Astra.

Microsoft publishes these [Global Standard rates](https://azure.microsoft.com/en-us/blog/gpt-6-astra-sol-and-luna-for-production-agents-in-microsoft-foundry/) in USD per million tokens. Each cell shows short-context / long-context pricing:

| Model       | Input         | Cached input  | Cache writes   | Output        |
| ----------- | ------------- | ------------- | -------------- | ------------- |
| GPT-6 Astra | $10 / $20     | $1 / $2       | $12.50 / $25   | $50 / $75     |
| GPT-6 Sol   | $2 / $4       | $0.20 / $0.40 | $2.50 / $5     | $10 / $15     |
| GPT-6 Luna  | $0.10 / $0.20 | $0.01 / $0.02 | $0.125 / $0.25 | $0.50 / $0.75 |

Promptfoo's Azure providers do not yet estimate GPT-6 costs. Check Azure billing for your deployment; Data Zone, priority, and provisioned rates differ.

[Azure's model lifecycle schedule](https://learn.microsoft.com/azure/foundry/openai/concepts/model-retirement-schedule)
lists `grok-3`, `grok-3-mini`, `grok-4-fast-reasoning`, and
`grok-4-fast-non-reasoning` as retired on May 1, 2026. Their replacements are `grok-4`,
`grok-4-1-fast-reasoning`, and `grok-4-1-fast-non-reasoning`. Azure also retired
`Cohere-command-r-08-2024` and `Cohere-command-r-plus-08-2024` on May 12, 2026. Promptfoo keeps
cost entries for those retired IDs so historical deployments can still report cost, but new
deployments should use the current IDs above. Promptfoo does not assign a built-in price to the
`grok-4-20-*` Preview models because the Azure Retail Prices API does not expose an unambiguous
matching meter. `Kimi-K2.7-Code` is also left unpriced until Azure publishes an unambiguous meter.
Azure retired the `gpt-5.1-chat`, `gpt-5.2-chat`, and `gpt-5.3-chat` versions by June 29, 2026 in favor of
`gpt-chat-latest`. Promptfoo retains their cost metadata only for historical results.

### GPT-chat-latest on Azure

This model uses fixed reasoning. Promptfoo omits configurable reasoning effort while retaining
reasoning-model token and sampling controls. For an opaque deployment name, set `modelName: gpt-chat-latest`
so these rules apply. See [Microsoft's model documentation](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure).

Azure's exact product and model ID is `gpt-chat-latest`, not `gpt-5-chat-latest` or OpenAI's
`chat-latest` API alias. Azure publishes dates as model versions, separately from the deployment name you choose. Promptfoo accepts arbitrary deployment names; recognizable `<model>-<version>` names can also match built-in cost metadata.

[Microsoft's retirement schedule](https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/model-retirement-schedule) lists:

| Preview version | Retirement date    |
| --------------- | ------------------ |
| `2026-05-05`    | August 5, 2026     |
| `2026-05-28`    | August 28, 2026    |
| `2026-06-24`    | September 24, 2026 |
| `2026-08-06`    | December 2, 2026   |

Use a version available to your Azure resource. Historical cost metadata does not establish that a retired version remains served.

### GPT-5.6 on Azure

Microsoft's [model lifecycle table](https://learn.microsoft.com/azure/foundry/openai/concepts/model-retirement-schedule) lists `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna` model version `2026-07-09` as generally available. Azure documents Global Standard availability worldwide and Data Zone Standard availability in the US, EU, and APAC; check the [current region matrix](https://learn.microsoft.com/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure-region-availability) before deploying.

Azure does not document the bare `gpt-5.6` alias. Deploy a concrete tier, then use your customer-defined deployment name with `azure:chat:` or `azure:responses:`. Promptfoo accepts arbitrary deployment names and auto-detects GPT-5 reasoning behavior when the name includes a recognizable GPT-5 model ID. Built-in standard and long-context cost estimates are available when the deployment name exactly matches `gpt-5.6`, `gpt-5.6-sol`, `gpt-5.6-terra`, or `gpt-5.6-luna`; an opaque alias cannot be matched automatically, so no cost is reported for it. Separately, set `isReasoningModel: true` on an opaque alias to keep GPT-5 reasoning request behavior (this does not affect cost matching).

The Azure pricing table also recognizes `gpt-audio` and `gpt-realtime` aliases (including mini and 1.5 variants). Promptfoo does not provide built-in cost estimates for `gpt-5.5-pro`, `gpt-5.2-pro`, or their dated snapshots; check Azure billing for those deployments. For models with published priority rates, including GPT-5.6 and several GPT-5.1 to GPT-5.5 snapshots, set `passthrough.service_tier: priority` on `azure:chat`, `azure:completion`, or `azure:responses`. Promptfoo tracks text and audio tokens separately and uses discounted cached-input rates where available.

`azure:responses` also accepts a top-level `service_tier`; `passthrough.service_tier` takes precedence when both are configured. Its cost estimate uses the tier Azure returned, falling back to the effective requested tier only when the response omits it. Azure can [serve a different tier than requested](https://learn.microsoft.com/azure/foundry/openai/concepts/priority-processing#limitations), so requesting priority does not always imply priority pricing.

### Azure Realtime API

Use `azure:realtime:<deployment name>` for current GA Realtime deployments. Promptfoo connects to the Azure GA WebSocket endpoint (`/openai/v1/realtime?model=<deployment name>`), forwards API-key or Microsoft Entra authentication, isolates persistent sessions by `conversationId`, and reports separate text, audio, image, and cached-input token costs. Explicit HTTP proxy base URLs are also supported.

```yaml
providers:
  - id: azure:realtime:gpt-realtime-1.5-2026-02-23
    config:
      apiHost: your-resource.openai.azure.com
      apiKeyEnvar: AZURE_API_KEY
      modalities: ['text', 'audio']
```

Realtime prompts can include `input_image` parts in the user message. The preview Realtime endpoint (`/openai/realtime?api-version=...&deployment=...`) uses a different wire format and is not selected by this provider.

## Azure Responses API

The Azure OpenAI Responses API supports stateful conversations, MCP servers, code interpreter, and background tasks.

Incomplete responses preserve partial text and expose `metadata.responseStatus` and `metadata.incompleteReason`. When the reason is `max_output_tokens`, `finishReason` is `length`, so a `finish-reason` assertion can detect the output limit. Promptfoo does not automatically retry or continue incomplete output.

### Using the Responses API

To use the Azure Responses API with promptfoo, use the `azure:responses` provider type:

```yaml
providers:
  # Using the azure:responses alias (recommended)
  # Note: deployment name must match your Azure deployment, not the model name
  - id: azure:responses:my-gpt-4-1-deployment
    config:
      temperature: 0.7
      instructions: 'You are a helpful assistant.'
      response_format: file://./response-schema.json
      # For newer v1 API, use 'preview' (default)
      # For legacy API, use specific version like '2025-04-01-preview'
      apiVersion: 'preview'
```

Use `azure:responses` for Azure deployments. It builds the Azure `/openai/v1/responses` URL and
supports Azure API keys and Microsoft Entra ID. Setting only `apiHost` on `openai:responses`
does not select the Azure URL or its API-key authentication.

### Supported Responses Models

The Responses API supports Azure deployments backed by current Azure OpenAI responses-capable models. Common examples include:

- **GPT-6 Series**: `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`
- **GPT-5 Series**: `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.4`, `gpt-5.4-pro`, `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5.1`
- **GPT-4 Series**: `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`
- **Reasoning Models**: `o1`, `o1-mini`, `o1-pro`, `o3`, `o3-mini`, `o3-pro`, `o4-mini`
- **Specialized Models**: `computer-use-preview`, `gpt-image-1`, `gpt-image-1-mini`, `gpt-image-1.5`, `gpt-image-2`, `codex-mini-latest`
- **Deep Research Models**: `o3-deep-research`, `o4-mini-deep-research`

Use your Azure deployment name in promptfoo, even if it differs from the underlying model ID.

### Reasoning Effort, Tokens, and Summaries

As described in Microsoft's
[Azure reasoning models documentation](https://learn.microsoft.com/azure/foundry/openai/how-to/reasoning#reasoning-summary),
Azure does not expose a reasoning model's private chain-of-thought. Configuring
`reasoning_effort` controls how much reasoning work the model may perform; it does not
make hidden reasoning steps visible.

| Provider type     | Reasoning request behavior                                                                                                                | Visible promptfoo output                                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `azure:chat`      | For reasoning deployments, sends `reasoning_effort` and `max_completion_tokens`; set `isReasoningModel: true` for aliases                 | Assistant `message.content`. If Azure reports `completion_tokens_details.reasoning_tokens`, promptfoo records that count in `tokenUsage.completionDetails.reasoning`. |
| `azure:responses` | For reasoning deployments, maps `reasoning_effort` to `reasoning.effort` and uses `max_output_tokens`; set `isReasoningModel` for aliases | Assistant output plus an Azure-provided reasoning **summary** when the response contains a non-empty `output` reasoning item. It is not raw chain-of-thought.         |

For `azure:responses`, the current provider exposes Azure's summary request through
`passthrough.reasoning`. Keep `effort` and `summary` in that same raw object because
`passthrough` supplies the final Responses API field:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Compare Azure reasoning output surfaces

prompts:
  - 'Which is larger: 9.11 or 9.9? Answer with a brief explanation.'

providers:
  - id: azure:chat:my-o4-mini-deployment
    label: azure-chat-final-answer
    config:
      apiHost: 'your-resource.openai.azure.com'
      isReasoningModel: true
      reasoning_effort: 'medium'
      max_completion_tokens: 2000

  - id: azure:responses:my-gpt-5-deployment
    label: azure-responses-summary
    config:
      apiHost: 'your-resource.openai.azure.com'
      isReasoningModel: true
      max_output_tokens: 2000
      passthrough:
        reasoning:
          effort: 'medium'
          summary: 'auto'

tests:
  - assert:
      - type: contains
        value: '9.9'
```

Set `AZURE_API_KEY`, replace the deployment names and `apiHost`, then run:

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml --no-cache -o output.json
```

If Azure returns a Responses API reasoning summary, promptfoo includes it in normalized
output as `Reasoning: <summary>` before the assistant answer and preserves the API
response in `raw`. A returned reasoning token count without summary text indicates
hidden reasoning usage, not missing chain-of-thought output.

### Responses API Features

#### Response Format with External Files

Load complex JSON schemas from external files for better organization:

```yaml
providers:
  - id: azure:responses:my-gpt-4-1-deployment
    config:
      apiHost: 'your-resource.openai.azure.com'
      response_format: file://./schemas/response-schema.json
```

Example `response-schema.json`:

```json
{
  "type": "json_schema",
  "name": "structured_output",
  "schema": {
    "type": "object",
    "properties": {
      "result": { "type": "string" },
      "confidence": { "type": "number" }
    },
    "required": ["result", "confidence"],
    "additionalProperties": false
  }
}
```

You can also use nested file references for the schema itself:

```json
{
  "type": "json_schema",
  "name": "structured_output",
  "schema": "file://./schemas/output-schema.json"
}
```

Variable rendering is supported in file paths:

```yaml
config:
  response_format: file://./schemas/{{ schema_name }}.json
```

#### Advanced Configuration

**Instructions**: Provide system-level instructions to guide model behavior:

```yaml
config:
  instructions: 'You are a helpful assistant specializing in technical documentation.'
```

**Background Tasks**: Enable asynchronous processing for long-running tasks. The provider does
not model `background` directly, so forward it through `passthrough` (which is merged into the
request body):

```yaml
config:
  store: true
  passthrough:
    background: true
```

**Chaining Responses**: Chain multiple responses together for multi-turn conversations:

```yaml
config:
  previous_response_id: '{{previous_id}}'
```

**MCP Servers**: Connect to remote MCP servers for extended tool capabilities:

```yaml
config:
  tools:
    - type: mcp
      server_label: github
      server_url: https://example.com/mcp-server
      require_approval: never
      headers:
        Authorization: 'Bearer {{ env.MCP_API_KEY }}'
```

**Code Interpreter**: Enable code execution capabilities:

```yaml
config:
  tools:
    - type: code_interpreter
      container:
        type: auto
```

**Web Search**: Enable web search capabilities:

```yaml
config:
  tools:
    - type: web_search_preview
```

**Image Generation**: Use image generation with supported models:

```yaml
config:
  tools:
    - type: image_generation
```

### Complete Responses API Example

Here's an example using multiple Azure Responses API features:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Azure Responses API evaluation

providers:
  # Using the azure:responses alias (recommended)
  - id: azure:responses:gpt-4.1-deployment
    label: azure-gpt-4.1
    config:
      temperature: 0.7
      max_output_tokens: 2000
      instructions: 'You are a helpful AI assistant.'
      response_format:
        type: json_schema
        name: structured_output
        schema:
          type: object
          properties:
            result:
              type: string
            confidence:
              type: number
          required: [result, confidence]
          additionalProperties: false
      tools:
        - type: code_interpreter
          container:
            type: auto
        - type: web_search_preview
      metadata:
        session: 'eval-001'
        user: 'test-user'
      store: true

  # Reasoning model example
  - id: azure:responses:o3-mini-deployment
    label: azure-reasoning
    config:
      isReasoningModel: true
      reasoning_effort: medium
      max_output_tokens: 4000

prompts:
  - '{{task}}'

tests:
  - vars:
      task: 'Analyze this data and provide insights: Sales increased by 25% in Q3 compared to Q2'
    assert:
      - type: contains
        value: 'growth'
      - type: contains
        value: '25%'

  - vars:
      task: 'Write a Python function to solve: Calculate fibonacci sequence up to n terms'
    assert:
      - type: javascript
        value: |
          const text = typeof output === 'string' ? output : output.result;
          return typeof text === 'string' &&
            (text.includes('def fibonacci') || text.includes('function fibonacci'));
      - type: contains
        value: 'recursive'
```

### Additional Responses API Configuration

The Azure Responses provider expects a complete JSON response. Leave `stream` unset; streamed responses and partial images are not supported.

**Parallel Tool Calls**: Allow multiple tool calls in parallel:

```yaml
config:
  parallel_tool_calls: true
  max_tool_calls: 5
```

**Truncation**: Configure how input is truncated when it exceeds limits:

```yaml
config:
  truncation: auto # or 'disabled'
```

**Webhook URL**: Set a webhook for async notifications. Like `background`, `webhook_url` is
forwarded via `passthrough`:

```yaml
config:
  passthrough:
    webhook_url: 'https://your-webhook.com/callback'
```

### Responses API Limitations

- Web search tool support is in development
- PDF file upload with `purpose: user_data` requires workaround (use `purpose: assistants`)
- Background mode requires `store: true`
- Some features may have region-specific availability

## Environment Variables

The Azure OpenAI provider supports the following environment variables:

| Environment Variable           | Config Key           | Description                                                                             | Required |
| ------------------------------ | -------------------- | --------------------------------------------------------------------------------------- | -------- |
| `AZURE_API_KEY`                | `apiKey`             | Your Azure OpenAI API key                                                               | No\*     |
| `AZURE_API_HOST`               | `apiHost`            | API host                                                                                | No       |
| `AZURE_API_BASE_URL`           | `apiBaseUrl`         | API base URL                                                                            | No       |
| `AZURE_DEPLOYMENT_NAME`        | -                    | Opt-in flag that, with `AZURE_OPENAI_DEPLOYMENT_NAME`, makes Azure the default provider | No†      |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | -                    | Deployment used when Azure is the default provider                                      | No†      |
| `AZURE_CLIENT_ID`              | `azureClientId`      | Azure AD application client ID                                                          | No\*     |
| `AZURE_CLIENT_SECRET`          | `azureClientSecret`  | Azure AD application client secret                                                      | No\*     |
| `AZURE_TENANT_ID`              | `azureTenantId`      | Azure AD tenant ID                                                                      | No\*     |
| `AZURE_AUTHORITY_HOST`         | `azureAuthorityHost` | Azure AD authority host                                                                 | No       |
| `AZURE_TOKEN_SCOPE`            | `azureTokenScope`    | Azure AD token scope                                                                    | No       |

\* Set `AZURE_API_KEY`, provide all three client credentials, or sign in with `az login`.

† Not needed when you name the deployment in the provider ID (e.g. `azure:chat:my-deployment`). Both are required only to make Azure the default provider (see [Default Deployment](#default-deployment)).

Set either `AZURE_API_HOST` or `AZURE_API_BASE_URL`; if both are set, the base URL wins. `apiHost` also accepts `AZURE_OPENAI_API_HOST`. `apiBaseUrl` also accepts `AZURE_OPENAI_API_BASE_URL`, then `AZURE_OPENAI_BASE_URL`.

### Default Deployment

Azure OpenAI becomes the default provider (used for grading, dataset generation, suggestions, and synthesis) when **all** of these hold:

1. No OpenAI API key is present (`OPENAI_API_KEY` is not set)
2. Azure authentication is configured (either via API key or client credentials)
3. Both `AZURE_DEPLOYMENT_NAME` **and** `AZURE_OPENAI_DEPLOYMENT_NAME` are set

The default deployment is taken from `AZURE_OPENAI_DEPLOYMENT_NAME` (`AZURE_DEPLOYMENT_NAME` acts as the opt-in flag). If `AZURE_DEPLOYMENT_NAME` is set but `AZURE_OPENAI_DEPLOYMENT_NAME` is not, Azure is not selected as the default.

For example, if you have these environment variables set:

```bash
AZURE_DEPLOYMENT_NAME=gpt-4o
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o
AZURE_API_KEY=your-api-key
AZURE_API_HOST=your-host.openai.azure.com
```

Or these client credential environment variables:

```bash
AZURE_DEPLOYMENT_NAME=gpt-4o
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
AZURE_TENANT_ID=your-tenant-id
AZURE_API_HOST=your-host.openai.azure.com
```

Then Azure OpenAI will be used as the default provider for all operations including:

- Dataset generation
- Grading
- Suggestions
- Synthesis

### Embedding Models

Because embedding models are distinct from text generation models, to set a default embedding provider you must specify `AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME`.

When Azure is selected for chat and this variable is absent, promptfoo uses configured Gemini API, Mistral, or Voyage embedding credentials, then Google Application Default Credentials. It keeps Azure for chat and never sends embedding requests to the chat deployment. Without another embedding credential, the existing OpenAI embedding fallback requires its own API key. An explicit embedding provider override takes precedence; keep that override when comparing against an existing vector index.

Set this environment variable to the deployment name of your embedding model:

```bash
AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME=text-embedding-3-small
```

This deployment will automatically be used whenever embeddings are required, such as for similarity comparisons or dataset generation. You can also override the embedding provider in your configuration:

```yaml
defaultTest:
  options:
    provider:
      embedding:
        id: azure:embedding:text-embedding-3-small-deployment
        config:
          apiHost: 'your-resource.openai.azure.com'
```

For `text-embedding-3` deployments, set `config.dimensions` to request shorter vectors. Omit it to use the model's default vector size. Use the same embedding model and dimensions for indexed documents and queries; changing either requires rebuilding existing vectors. Azure deployment names are user-defined and remain unchanged by this option.

By default, moderation tasks use the OpenAI API. If you configure `AZURE_CONTENT_SAFETY_ENDPOINT`, they use Azure Content Safety instead.

## Configuration

The YAML configuration can override environment variables and set additional parameters:

```yaml
providers:
  - id: azure:chat:deploymentNameHere
    config:
      apiHost: 'xxxxxxxx.openai.azure.com'
      # Authentication (Option 1: API Key)
      apiKey: 'your-api-key'

      # Authentication (Option 2: Client Credentials)
      azureClientId: 'your-azure-client-id'
      azureClientSecret: 'your-azure-client-secret'
      azureTenantId: 'your-azure-tenant-id'
      azureAuthorityHost: 'https://login.microsoftonline.com' # Optional
      azureTokenScope: 'https://cognitiveservices.azure.com/.default' # Optional

      # OpenAI parameters
      temperature: 0.5
      max_tokens: 1024
```

:::tip

All other [OpenAI provider](/docs/providers/openai) environment variables and configuration properties are supported.

:::

## Using Client Credentials (Service Principal) {#using-client-credentials}

If you want to authenticate with a **Service Principal (SPN)** instead of an API key, follow these steps.

### Prerequisites

1. **Register an application** in [Azure Entra ID](https://portal.azure.com/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/RegisteredApps) (formerly Azure AD) to create a Service Principal.
2. **Create a client secret** for the app registration under _Certificates & secrets_.
3. **Assign the role** `Cognitive Services OpenAI User` (or `Cognitive Services Contributor`) to the Service Principal on your Azure OpenAI resource. Go to your resource's **Access control (IAM)** > **Add role assignment**.
4. **Install the `@azure/identity` package** — promptfoo uses it to obtain tokens from Azure Entra ID:

```sh
npm install @azure/identity
```

### Configuration

You can provide the Service Principal credentials via **environment variables** or directly in the YAML **config**.

**Using environment variables** (recommended for CI/CD and production):

```bash
export AZURE_CLIENT_ID="00000000-0000-0000-0000-000000000000"   # Application (client) ID
export AZURE_CLIENT_SECRET="your-client-secret-value"            # Client secret
export AZURE_TENANT_ID="00000000-0000-0000-0000-000000000000"   # Directory (tenant) ID
```

```yaml
providers:
  - id: azure:chat:my-gpt-4o-deployment
    config:
      apiHost: 'your-resource.openai.azure.com'
```

**Using inline config** (useful for local testing):

```yaml
providers:
  - id: azure:chat:my-gpt-4o-deployment
    config:
      apiHost: 'your-resource.openai.azure.com'
      azureClientId: '00000000-0000-0000-0000-000000000000'
      azureClientSecret: 'your-client-secret-value'
      azureTenantId: '00000000-0000-0000-0000-000000000000'
      azureAuthorityHost: 'https://login.microsoftonline.com' # Optional
      azureTokenScope: 'https://cognitiveservices.azure.com/.default' # Optional
```

### How It Works

When client credentials are provided, promptfoo uses the `@azure/identity` library to create a `ClientSecretCredential` and requests an access token scoped to Azure Cognitive Services (`https://cognitiveservices.azure.com/.default`). The token is then sent as a `Bearer` token in the `Authorization` header instead of an API key.

If neither an API key nor client credentials are provided, promptfoo falls back to `AzureCliCredential` (i.e., your `az login` session) — see [Option 3](#option-3-azure-cli-authentication).

Bearer tokens with an expiry time are refreshed within five minutes of expiry. If both an API key and credentials are configured, the API key takes precedence.

The `azureAuthorityHost` defaults to `https://login.microsoftonline.com` if not specified. The `azureTokenScope` defaults to `https://cognitiveservices.azure.com/.default`, the scope required to authenticate with Azure Cognitive Services. You typically don't need to change these unless you're working with a sovereign cloud (e.g., Azure Government or Azure China).

## Model-Graded Tests

[Model-graded assertions](/docs/configuration/expected-outputs/model-graded/) such as `factuality` or `llm-rubric` use a default OpenAI grader model unless overridden. When both `AZURE_DEPLOYMENT_NAME` and `AZURE_OPENAI_DEPLOYMENT_NAME` are set (and `OPENAI_API_KEY` is not), promptfoo automatically uses the Azure default for grading, provided Azure authentication is configured. You can also explicitly override the grader as shown below.

The easiest way to do this for _all_ your test cases is to add the [`defaultTest`](/docs/configuration/guide/#default-test-cases) property to your config:

```yaml
defaultTest:
  options:
    provider:
      id: azure:chat:gpt-4o-deployment
      config:
        apiHost: 'xxxxxxx.openai.azure.com'
```

However, you can also do this for individual assertions:

```yaml
# ...
assert:
  - type: llm-rubric
    value: Do not mention that you are an AI or chat assistant
    provider:
      id: azure:chat:xxxx
      config:
        apiHost: 'xxxxxxx.openai.azure.com'
```

Or individual tests:

```yaml
# ...
tests:
  - vars:
      # ...
    options:
      provider:
        id: azure:chat:xxxx
        config:
          apiHost: 'xxxxxxx.openai.azure.com'
    assert:
      - type: llm-rubric
        value: Do not mention that you are an AI or chat assistant
```

### Using Text and Embedding Providers for Different Assertion Types

When you have tests that use both text-based assertions (like `llm-rubric`, `answer-relevance`) and embedding-based assertions (like `similar`), you can configure different Azure deployments for each type using the **provider type map** pattern:

```yaml
defaultTest:
  options:
    provider:
      # Text provider for llm-rubric, answer-relevance, factuality, etc.
      text:
        id: azure:chat:o4-mini-deployment
        config:
          apiHost: 'text-models.openai.azure.com'

      # Embedding provider for similarity assertions
      embedding:
        id: azure:embedding:text-embedding-3-large
        config:
          apiHost: 'embedding-models.openai.azure.com'
```

### Similarity

The `similar` assertion type requires an embedding model such as `text-embedding-3-large` or `text-embedding-3-small`. Be sure to specify a deployment with an embedding model, not a chat model, when overriding the grader.

For example, override the embedding deployment in your config:

```yaml
defaultTest:
  options:
    provider:
      embedding:
        id: azure:embedding:text-embedding-3-small-deployment
        config:
          apiHost: 'your-resource.openai.azure.com'
```

## AI Services

You may also specify `data_sources` to integrate with the [Azure AI Search API](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/references/on-your-data).

```yaml
providers:
  - id: azure:chat:deploymentNameHere
    config:
      apiHost: 'xxxxxxxx.openai.azure.com'
      deployment_id: 'abc123'
      data_sources:
        - type: azure_search
          parameters:
            endpoint: https://xxxxxxxx.search.windows.net
            index_name: index123
            authentication:
              type: api_key
              key: ''
```

:::note

For legacy Azure OpenAI API versions before 2024-02-15-preview, you can also specify `deployment_id` and `dataSources`, used to integrate with the [Azure AI Search API](https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/use-your-data#conversation-history-for-better-results).

```yaml
providers:
  - id: azure:chat:deploymentNameHere
    config:
      apiHost: 'xxxxxxxx.openai.azure.com'
      deployment_id: 'abc123'
      dataSources:
        - type: AzureCognitiveSearch
          parameters:
            endpoint: '...'
            key: '...'
            indexName: '...'
```

:::

## Configuration Reference

These properties can be set under the provider `config` key:

### General Configuration

| Name       | Description                                               |
| ---------- | --------------------------------------------------------- |
| apiHost    | API host (e.g., `yourresource.openai.azure.com`)          |
| apiBaseUrl | Base URL of the API (used instead of host)                |
| apiKey     | API key for authentication                                |
| apiVersion | API version. Use `2024-10-21` or newer for vision support |

### Azure-Specific Configuration

| Name               | Description                                                    |
| ------------------ | -------------------------------------------------------------- |
| azureClientId      | Azure identity client ID                                       |
| azureClientSecret  | Azure identity client secret                                   |
| azureTenantId      | Azure identity tenant ID                                       |
| azureAuthorityHost | Azure identity authority host                                  |
| azureTokenScope    | Azure identity token scope                                     |
| deployment_id      | Azure cognitive services deployment ID                         |
| dataSources        | Azure cognitive services parameter for specifying data sources |

### OpenAI Configuration

| Name                  | Description                                                                                                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| o1                    | Set to `true` if your Azure deployment uses an o1 model. **(Deprecated, use `isReasoningModel` instead)**                                                                                                             |
| isReasoningModel      | Treat the deployment as reasoning-capable. Set to `true` for custom deployment names; recognizable reasoning model names are auto-detected.                                                                           |
| isClaudeOpus47OrLater | Set to `true` to omit unsupported sampling parameters for a custom-named Claude deployment. Prefer `modelName` for model-specific compatibility and cost estimates.                                                   |
| modelName             | Underlying Claude model ID for `azure:chat` compatibility and cost estimates when your deployment uses a custom alias. The deployment name is still sent to Azure.                                                    |
| max_completion_tokens | Maximum tokens for `azure:chat` reasoning models. Use `max_output_tokens` for `azure:responses`; `azure:completion` does not support it.                                                                              |
| max_output_tokens     | Maximum output tokens for `azure:responses`, including reasoning deployments.                                                                                                                                         |
| reasoning_effort      | Controls reasoning depth: 'minimal', 'low', 'medium', 'high', 'xhigh', or 'max' (model-dependent). Sent directly by `azure:chat` and as `reasoning.effort` by `azure:responses`. Not supported by `azure:completion`. |
| temperature           | Controls randomness (0-2). Not supported for reasoning models                                                                                                                                                         |
| max_tokens            | Maximum tokens to generate. Not supported for reasoning models                                                                                                                                                        |
| top_p                 | Controls nucleus sampling (0-1)                                                                                                                                                                                       |
| frequency_penalty     | Penalizes repeated tokens (-2 to 2)                                                                                                                                                                                   |
| presence_penalty      | Penalizes new tokens based on presence (-2 to 2)                                                                                                                                                                      |
| omitDefaults          | Omits hardcoded defaults unless values are explicitly set via config or environment variables. Supported by `azure:chat` and `azure:responses`.                                                                       |
| best_of               | Generates multiple outputs and returns the best                                                                                                                                                                       |
| functions             | Array of functions available for the model to call                                                                                                                                                                    |
| function_call         | Controls how the model calls functions                                                                                                                                                                                |
| response_format       | Specifies output format (e.g., `{ type: "json_object" }`)                                                                                                                                                             |
| stop                  | Array of sequences where the model will stop generating                                                                                                                                                               |
| passthrough           | Additional parameters to send with the request                                                                                                                                                                        |

## Using Reasoning Models (o1, o3, o3-mini, o4-mini)

For `azure:chat`, Azure OpenAI reasoning models like `o1`, `o3`, `o3-mini`, and `o4-mini`
operate differently from standard models with specific requirements:

1. They use `max_completion_tokens` instead of `max_tokens`
2. They don't support `temperature` (it's ignored)
3. They accept a `reasoning_effort` parameter ('low', 'medium', 'high')

For `azure:responses` reasoning deployments, use `max_output_tokens` and the Responses
configuration documented above.

`azure:completion` has no reasoning support: it always sends `max_tokens` and ignores
`isReasoningModel`, `max_completion_tokens`, and `reasoning_effort`. Use `azure:chat` or
`azure:responses` for reasoning deployments.

Since Azure allows custom deployment names that don't necessarily reflect the underlying model type, set `isReasoningModel: true` for aliases or deployment names that do not identify the reasoning model. Promptfoo auto-detects common o-series, GPT-5, DeepSeek-R1, Phi reasoning, and Grok reasoning deployment names. The explicit configuration below works with `azure:chat` deployments:

```yaml
# For chat endpoints
providers:
  - id: azure:chat:my-o4-mini-deployment
    config:
      apiHost: 'xxxxxxxx.openai.azure.com'
      # Set this flag to true for reasoning models (o1, o3, o3-mini, o4-mini)
      isReasoningModel: true
      # Use max_completion_tokens instead of max_tokens
      max_completion_tokens: 25000
      # Optional: Set reasoning effort (default is 'medium' unless omitDefaults is true)
      reasoning_effort: 'medium'
```

> Note: The `o1` flag is still supported for backward compatibility, but `isReasoningModel` is preferred as it more clearly indicates its purpose.

### Using Variables with Reasoning Effort

You can use variables in your configuration to dynamically adjust the reasoning effort based on your test cases:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
# Configure different reasoning efforts based on test variables
prompts:
  - 'Solve this complex math problem: {{problem}}'

providers:
  - id: azure:chat:my-o4-mini-deployment
    config:
      apiHost: 'xxxxxxxx.openai.azure.com'
      isReasoningModel: true
      max_completion_tokens: 25000
      # This will be populated from the test case variables
      reasoning_effort: '{{effort_level}}'

tests:
  - vars:
      problem: 'What is the integral of x²?'
      effort_level: 'low'
  - vars:
      problem: 'Prove the Riemann hypothesis'
      effort_level: 'high'
```

### Troubleshooting

If you encounter this error with `azure:chat`:

```
API response error: unsupported_parameter Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
```

For a custom or aliased reasoning deployment, this commonly means Promptfoo is not
treating it as a reasoning model because `isReasoningModel: true` is missing. Update
your config as shown above.

On `azure:completion` this error cannot be fixed with config: that endpoint always sends
`max_tokens`. Switch the deployment to `azure:chat` or `azure:responses`.

For `azure:responses`, use `max_output_tokens`, not `max_completion_tokens`. If you
request a reasoning summary and only see a final answer or a reasoning token count,
check that the Azure deployment supports Responses reasoning summaries and returned a
non-empty reasoning `summary` item. Promptfoo cannot expose hidden reasoning tokens as
text.

## Using Vision Models

Azure OpenAI supports vision-capable models like GPT-5.1, GPT-4o, and GPT-4.1 for image analysis.

### Configuration

```yaml
providers:
  - id: azure:chat:gpt-4o
    config:
      apiHost: 'your-resource-name.openai.azure.com'
      apiVersion: '2024-10-21' # or newer for vision support
```

### Image Input

Vision models require a specific message format. Images can be provided as:

- **URLs**: Direct image links
- **Local files**: Using `file://` paths (automatically converted to base64)
- **Base64**: Data URIs with format `data:image/jpeg;base64,YOUR_DATA`

```yaml
prompts:
  - |
    [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "What do you see in this image?"
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "{{image_url}}"
            }
          }
        ]
      }
    ]

tests:
  - vars:
      image_url: https://example.com/image.jpg # URL
  - vars:
      image_url: file://assets/image.jpg # Local file (auto base64)
  - vars:
      image_url: data:image/jpeg;base64,/9j/4A... # Base64
```

### Example

See the [Azure OpenAI example](https://github.com/promptfoo/promptfoo/tree/main/examples/azure/openai) for a complete working example with image analysis. Use `promptfooconfig.vision.yaml` for vision-specific features.

## Using Claude Models

Azure AI Foundry exposes Claude through two endpoint families. Pick the one that matches how you want to manage the model.

### Option 1 (recommended): Anthropic Messages endpoint

Use `anthropic:messages` with Foundry's native [Messages endpoint](https://platform.claude.com/docs/en/build-with-claude/claude-in-microsoft-foundry) for adaptive thinking,
effort controls, and automatic handling of unsupported sampling parameters. Set
`apiBaseUrl` to your resource's `/anthropic` prefix:

```yaml
providers:
  - id: anthropic:messages:claude-opus-5
    config:
      apiBaseUrl: 'https://<resource>.services.ai.azure.com/anthropic'
      apiKey: '{{env.AZURE_FOUNDRY_API_KEY}}'
      max_tokens: 1024
```

Promptfoo appends `/v1/messages` to the base URL automatically, so set `apiBaseUrl` to the `https://…/anthropic` prefix shown above.

:::warning
`claude-mythos-5` is a gated research Preview and Azure documents Microsoft Entra ID as its only
authentication method. The API-key example above does not apply to that deployment. Request access
and confirm an Entra-authenticated Messages path before selecting it.
:::

### Option 2: Azure OpenAI-compatible chat endpoint

For deployments that expose OpenAI-style chat completions, use `azure:chat`:

```yaml
providers:
  - id: azure:chat:claude-opus-5
    config:
      apiHost: 'your-deployment.services.ai.azure.com'
      apiVersion: '2025-04-01-preview'
      max_tokens: 4096
```

For Claude 5 and Opus 4.7/4.8 deployments with recognizable model names, promptfoo
omits unsupported `temperature`, `top_p`, and `top_k` values. Fable/Mythos 5.1 and
Opus 5.5 and Sonnet 5.5 also omit forced `tool_choice` values; use `auto` or `none` instead.

If your Azure deployment uses a custom alias, set `modelName` to the underlying Claude model ID. Promptfoo uses it for request compatibility and cost estimates while continuing to send the deployment name to Azure:

```yaml
providers:
  - id: azure:chat:prod-claude
    config:
      apiHost: 'your-deployment.services.ai.azure.com'
      apiVersion: '2025-04-01-preview'
      modelName: claude-fable-5-1
      max_tokens: 4096
```

:::note
The `azure:chat:` provider only applies to Azure Claude deployments that expose the OpenAI-compatible chat-completions API. Some Azure AI Foundry models-as-a-service Claude deployments only support the Anthropic Messages API and return `api_not_supported` for chat completions; those deployments are not reachable via `azure:chat:`. Use Option 1 (the Anthropic Messages API endpoint) for them. The existing `isClaudeOpus47OrLater: true` option remains available for sampling compatibility only.
:::

Available Claude deployments on Azure AI Foundry:

| Model                        | Description                                    |
| ---------------------------- | ---------------------------------------------- |
| `claude-fable-5-1`           | Claude Fable 5.1                               |
| `claude-mythos-5-1`          | Claude Mythos 5.1 (provider approval required) |
| `claude-fable-5`             | Claude Fable 5                                 |
| `claude-opus-5-5`            | Claude Opus 5.5                                |
| `claude-sonnet-5-5`          | Claude Sonnet 5.5                              |
| `claude-opus-5`              | Claude Opus 5                                  |
| `claude-opus-4-8`            | Claude Opus 4.8                                |
| `claude-opus-4-7`            | Claude Opus 4.7                                |
| `claude-opus-4-6-20260205`   | Claude Opus 4.6                                |
| `claude-sonnet-5`            | Claude Sonnet 5                                |
| `claude-sonnet-4-6`          | Claude Sonnet 4.6                              |
| `claude-opus-4-5-20251101`   | Claude Opus 4.5                                |
| `claude-sonnet-4-5-20250929` | Claude Sonnet 4.5                              |
| `claude-haiku-4-5-20251001`  | Claude Haiku 4.5                               |
| `claude-3-5-sonnet-20241022` | Claude 3.5 Sonnet                              |
| `claude-3-5-haiku-20241022`  | Claude 3.5 Haiku                               |

:::note
Anthropic deployments on Azure require `modelProviderData` (`industry`,
`organizationName`, `countryCode`) at creation time — Azure's provider
data-sharing equivalent. The `az cognitiveservices account deployment create`
command has no flag for it yet, so create the deployment via the REST API
(api-version `2025-10-01-preview`) with
`properties.modelProviderData: { "industry": ..., "organizationName": ..., "countryCode": ... }`.
:::

### Claude Configuration Example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Azure Claude evaluation

providers:
  - id: anthropic:messages:claude-opus-5
    label: claude-opus-5
    config:
      apiBaseUrl: 'https://<resource>.services.ai.azure.com/anthropic'
      apiKey: '{{env.AZURE_FOUNDRY_API_KEY}}'
      max_tokens: 4096
      effort: medium

prompts:
  - 'Explain {{concept}} in simple terms.'

tests:
  - vars:
      concept: quantum computing
    assert:
      - type: contains-any
        value: ['qubit', 'superposition']
```

## Using Llama Models

Azure AI Foundry provides access to Meta's Llama models, including Llama 4:

```yaml
providers:
  - id: azure:chat:Llama-4-Maverick-17B-128E-Instruct-FP8
    config:
      apiHost: 'your-deployment.services.ai.azure.com'
      apiVersion: '2025-04-01-preview'
      max_tokens: 4096
```

Available Llama models include:

- `Llama-4-Maverick-17B-128E-Instruct-FP8` - Llama 4 Maverick (128 experts)
- `Llama-4-Scout-17B-16E-Instruct` - Llama 4 Scout (16 experts; Azure Marketplace)
- `Llama-3.3-70B-Instruct` - Llama 3.3 70B

## Using DeepSeek Models

Azure AI supports DeepSeek reasoning models such as DeepSeek V4 Pro. These require specific configuration:

1. Set `isReasoningModel: true`
2. Use `max_completion_tokens` instead of `max_tokens`
3. Set API version to '2025-04-01-preview' (or later)

```yaml
providers:
  - id: azure:chat:DeepSeek-V4-Pro
    config:
      apiHost: 'your-deployment-name.services.ai.azure.com'
      apiVersion: '2025-04-01-preview'
      isReasoningModel: true
      max_completion_tokens: 2048
      reasoning_effort: 'medium' # Options: low, medium, high
```

For model-graded assertions, you can configure your `defaultTest` to use the same provider:

```yaml
defaultTest:
  options:
    provider:
      id: azure:chat:DeepSeek-V4-Pro
      config:
        apiHost: 'your-deployment-name.services.ai.azure.com'
        apiVersion: '2025-04-01-preview'
        isReasoningModel: true
        max_completion_tokens: 2048
```

Adjust `reasoning_effort` to control response quality vs. speed: `low` for faster responses, `medium` for balanced performance (default), or `high` for more thorough reasoning on complex tasks.

Azure lists `DeepSeek-R1` as Legacy until August 13, 2026, with `DeepSeek-V4-Pro` as its
replacement. `DeepSeek-R1-0528` and `DeepSeek-V3.1` retired July 13, 2026. Promptfoo retains
historical pricing metadata for those IDs so saved evaluation results can still report cost.

## Using Microsoft MAI Models

Microsoft's first-party **MAI** model family splits across two promptfoo provider types. Availability varies, so check the per-model notes below before relying on a model.

- **Image generation** models (`MAI-Image-2.6`, `MAI-Image-2.6-Flash`, `MAI-Image-2.5`, `MAI-Image-2.5-Flash` — all currently **Preview**) are [Foundry Models sold by Azure](https://learn.microsoft.com/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure), served from a Microsoft-managed `/mai/v1/images/generations` route, and use the dedicated **`azure:image`** provider. The provider supports text-to-image generation with explicit width and height. For MAI-Image-2.6 and MAI-Image-2.6-Flash, use `config.passthrough` to send the documented [`auto_aspect_ratio` and `web_grounding` boolean options](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-mai-image#request-parameters). Image editing uses a separate multipart `/mai/v1/images/edits` request and requires additional provider support.
- **Text / reasoning / coding** models (`MAI-DS-R1`, `MAI-Thinking-1`, `MAI-Code-1-Flash`) speak the standard chat-completions API and use **`azure:chat`**. promptfoo recognizes them for cost and reasoning detection, but their Azure availability is limited today — see [Reasoning chat](#reasoning-chat-azurechat).

Deploy a model to a Microsoft Foundry (AIServices) resource, then point promptfoo at the resource's `*.services.ai.azure.com` endpoint. This example uses the [documented MAI-Image-2.6 version `2026-07-31`](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-mai-image#mai-image-models-at-a-glance); confirm regional availability before deploying:

```bash
az cognitiveservices account deployment create \
  --name <RESOURCE> --resource-group <RG> \
  --deployment-name mai-image-2-6 \
  --model-name MAI-Image-2.6 --model-format Microsoft \
  --model-version 2026-07-31 --sku-name GlobalStandard --sku-capacity 1

export AZURE_API_HOST=<RESOURCE>.services.ai.azure.com
export AZURE_API_KEY=<key>   # or authenticate with `az login` (Entra ID)
```

### Image generation (`azure:image`)

[Azure retired `MAI-Image-2` and `MAI-Image-2e` on August 15, 2026](https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/model-retirement-schedule). The 2.5 variants retire on October 1, 2026. For new deployments, review the preview [MAI-Image-2.6 and MAI-Image-2.6-Flash models](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-mai-image) and confirm regional availability. Historical cost metadata remains available.

```yaml title="promptfooconfig.yaml"
prompts:
  - '{{prompt}}'

providers:
  - id: azure:image:mai-image-2-6
    config:
      # Optional model ID for cost lookup; no built-in 2.6 price is available yet.
      model: MAI-Image-2.6
      width: 1024 # min 768; width * height must be <= 1,048,576
      height: 1024
      passthrough:
        auto_aspect_ratio: false # Set true to let the model choose the aspect ratio
        web_grounding: false # Set true to use Bing Search context

tests:
  - vars:
      prompt: A photorealistic red cube on a clean white background, studio lighting
    assert:
      # The image is returned as a base64 PNG, which promptfoo stores as a blob ref.
      - type: javascript
        value: output.startsWith('promptfoo://blob/') || output.startsWith('data:image/')
```

The provider returns the generated image as a base64 PNG data URL (rendered inline in the web viewer) and reports token usage from the API's token counts. Cost estimates require a matching built-in model price; uncached `MAI-Image-2.6` and `MAI-Image-2.6-Flash` responses omit cost because these models have no price entries. The MAI image API has shipped two response shapes — a `usage` object (`num_output_tokens` plus `num_input_text_tokens`/`num_input_image_tokens`) and a legacy top-level `num_output_tokens` — and the provider reads both. The model's `revised_prompt` is surfaced in `metadata.revisedPrompt`.

To grade generated images with a vision LLM, use an `llm-rubric` assertion with a vision-capable grader and a custom `rubricPrompt` that passes the image as an `image_url` block, and run with `PROMPTFOO_INLINE_MEDIA=true` so `{{output}}` is an inline data URL the grader can read. The [`azure-mai` example](https://github.com/promptfoo/promptfoo/tree/main/examples/azure-mai) illustrates this grading pattern with a legacy 2.5 deployment; update its deployment and model settings for the 2.6 configuration above.

### Reasoning chat (`azure:chat`)

MAI text models run through the standard `azure:chat` provider. **Availability is limited:** `MAI-DS-R1` is marked **Deprecated** in the Azure model catalog, and `MAI-Thinking-1` / `MAI-Code-1-Flash` are in **private preview** and may not appear in the public CLI catalog. promptfoo already recognizes these names for cost and reasoning detection, so they work through `azure:chat` once your subscription can deploy them — confirm availability with `az cognitiveservices model list`.

promptfoo auto-detects `MAI-Thinking-1` and `MAI-DS-R1` as reasoning models by name: it sends `max_completion_tokens` (instead of `max_tokens`) and drops `temperature`. It still sends default `top_p`/`presence_penalty`/`frequency_penalty` unless you set `omitDefaults: true` — do that if a deployment rejects those sampling parameters. `MAI-Code-1-Flash` is treated as a standard chat model.

```yaml
providers:
  - id: azure:chat:mai-thinking-1
    config:
      apiHost: 'your-resource.services.ai.azure.com'
      max_completion_tokens: 2048
      reasoning_effort: 'medium' # forwarded as-is; honored only if the deployment supports it
      # omitDefaults: true       # uncomment if the deployment rejects top_p / penalties
```

:::note
The MAI image models are in **Preview**, and the MAI text models roll out region-by-region (`MAI-DS-R1` deprecated; `MAI-Thinking-1` / `MAI-Code-1-Flash` private preview). Run `az cognitiveservices model list --location <region>` to see what your subscription can actually deploy.
:::

## Assistants

:::warning Retired API

[Azure OpenAI Assistants retired on August 26, 2026](https://learn.microsoft.com/en-us/azure/foundry/how-to/navigate-from-classic). Use the Foundry agent provider for new agent evaluations. The configuration below documents the legacy integration; assistant IDs and Foundry agent names are different resources and cannot be substituted directly.

:::

The following setup and examples are archival references for pre-retirement configurations, not instructions for creating new Azure OpenAI assistants. Before retirement, this integration required:

1. An Azure OpenAI deployment
2. An assistant created in the Azure web UI
3. A provider configuration referencing the assistant ID:

```yaml
providers:
  - id: azure:assistant:asst_E4GyOBYKlnAzMi19SZF2Sn8I
    config:
      apiHost: yourdeploymentname.openai.azure.com
```

The assistant ID and deployment name above represent the former Azure OpenAI resources; they are not Foundry agent identifiers.

### Function Tools with Assistants

The retired Azure OpenAI Assistants integration supported tool calling through `tools` schemas and `functionToolCallbacks` implementations. This archived configuration shows that former contract:

:::warning Callback files must live inside `basePath`

Callbacks referenced by `file://` URLs are loaded with a path-traversal guard:
the resolved path must stay inside the config's `basePath`. Move the callback
file into your project or set `PROMPTFOO_DISABLE_CALLBACK_PATH_GUARD=true` to
opt out. See [OpenAI provider docs](./openai.md#automatically-handling-function-tool-calls)
for details.

:::

```yaml
providers:
  - id: azure:assistant:your_assistant_id
    config:
      apiHost: your-resource-name.openai.azure.com
      # Load function tool definition
      tools: file://tools/weather-function.json
      functionToolCallbacks:
        # To use a file instead, replace the inline function with:
        # get_weather: file://callbacks/weather.js:getWeather
        get_weather: |
          async function(args) {
            try {
              const parsedArgs = JSON.parse(args);
              const location = parsedArgs.location;
              const unit = parsedArgs.unit || 'celsius';
              // Function implementation...
              return JSON.stringify({
                location,
                temperature: 22,
                unit,
                condition: 'sunny'
              });
            } catch (error) {
              return JSON.stringify({ error: String(error) });
            }
          }
```

### Using Vector Stores with Assistants

The retired Azure OpenAI Assistants integration supported file search with vector stores. Its setup required:

1. A vector store created in the Azure Portal or via the API
2. An assistant configuration referencing that store:

```yaml
providers:
  - id: azure:assistant:your_assistant_id
    config:
      apiHost: your-resource-name.openai.azure.com
      # Add tools for file search
      tools:
        - type: file_search
      # Configure vector store IDs
      tool_resources:
        file_search:
          vector_store_ids:
            - 'your_vector_store_id'
      # Optional parameters
      temperature: 1
      top_p: 1
      apiVersion: '2025-04-01-preview'
```

This archived configuration used a `file_search` tool, the `tool_resources.file_search.vector_store_ids` array, and the `2025-04-01-preview` API version.

### Simple Example

This archived eval shows the former Azure OpenAI assistant configuration:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
prompts:
  - 'Write a tweet about {{topic}}'

providers:
  - id: azure:assistant:your_assistant_id
    config:
      apiHost: your-resource-name.openai.azure.com

tests:
  - vars:
      topic: bananas
```

Historical Azure OpenAI Assistants configurations are preserved in the [Azure Assistant example directory](https://github.com/promptfoo/promptfoo/tree/main/examples/azure/assistant).

The [legacy Assistants evaluation guide](/docs/guides/evaluate-openai-assistants/) documents compatible endpoints that still implement that API. For Azure, use the [Foundry agent provider](#azure-ai-foundry-agents) for new agent evaluations.

## Azure AI Foundry Agents

Use `azure:foundry-agent:<agent-name>` to eval an existing Foundry agent through the Responses API. You need the agent's name and its project endpoint.

### Setup

Install the Azure SDK packages and sign in:

```bash
npm install @azure/ai-projects @azure/identity
az login
```

The provider uses `DefaultAzureCredential`, which also supports service principals, workload identity, and managed identity. Azure OpenAI API keys do not authenticate Foundry agents.

Copy the project endpoint from your Foundry project overview:

```bash
export AZURE_AI_PROJECT_URL="https://your-resource.services.ai.azure.com/api/projects/your-project"
```

### Basic Configuration

Replace `my-foundry-agent` with your agent's name:

```yaml
providers:
  - id: azure:foundry-agent:my-foundry-agent
```

To set the endpoint in YAML, use `config.projectUrl`; it overrides `AZURE_AI_PROJECT_URL`. Agent names are preferred, though legacy IDs can be looked up within the project.

### Complete Example

Save this as `promptfooconfig.yaml` after setting the project endpoint:

```yaml title="promptfooconfig.yaml"
prompts:
  - '{{question}}'

providers:
  - id: azure:foundry-agent:my-foundry-agent

tests:
  - vars:
      question: 'What is the capital of France?'
    assert:
      - type: contains
        value: 'Paris'
```

Run `npx promptfoo@latest eval`.

### Configuration Options

Set these under the provider's `config`:

| Parameter                             | Description                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| `projectUrl`                          | Project endpoint; overrides `AZURE_AI_PROJECT_URL`                                   |
| `instructions`                        | Per-request instructions                                                             |
| `temperature`, `top_p`                | Sampling settings, if supported by the model                                         |
| `max_tokens`, `max_completion_tokens` | Responses API `max_output_tokens`                                                    |
| `response_format`                     | `json_object` or `json_schema` output                                                |
| `tools`, `tool_choice`                | Tool definitions and selection                                                       |
| `functionToolCallbacks`               | Local callbacks for function calls                                                   |
| `modelName`                           | Model override                                                                       |
| `reasoning_effort`                    | Responses API `reasoning.effort`                                                     |
| `verbosity`                           | Responses text verbosity                                                             |
| `metadata`                            | Request metadata                                                                     |
| `passthrough`                         | Additional Responses API fields                                                      |
| `maxPollTimeMs`                       | Tool-loop time budget after the first response (default: `300000` ms)                |
| `timeoutMs`                           | Deadline for each request attempt (default: `600000` ms)                             |
| `retryOptions.maxRetries`             | Non-negative integer retry count (default: `2`); other retry options are unsupported |
| `maxToolIterations`                   | Maximum callback batches (default: `8`; range: `1`–`64`)                             |

The runtime ignores `tool_resources`, `frequency_penalty`, `presence_penalty`, `seed`, and `stop` on eval requests. Configure these on the agent in Foundry where supported.

### Function Tools with Azure Foundry Agents

Configure callbacks for functions defined on your agent or in `tools`. Callbacks receive JSON-encoded arguments and a context object:

```yaml
providers:
  - id: azure:foundry-agent:my-foundry-agent
    config:
      functionToolCallbacks:
        get_current_weather: |
          (args, context) => {
            const { location } = JSON.parse(args);
            return JSON.stringify({ location, temperature: 72, unit: 'F' });
          }
```

This callback returns a fixed value for testing. You can also load a callback from a file, such as `file://callbacks/weather.js:getCurrentWeather`, or override callbacks per prompt.

Context contains `{ threadId, runId, assistantId, provider, abortSignal? }`. If any function in a batch has no callback, Promptfoo returns the unresolved calls without running that batch.

Settings carry over to each tool turn. A forced `tool_choice` applies to the first request, then changes to `auto` so the agent can answer. Any `allowed_tools` restriction remains in place.

### Agent-Defined Tools and Resources

Configure file search, vector stores, and their bindings on the agent in Foundry. Passing `tools: [{ type: file_search }]` declares the tool but does not attach a vector store. The runtime ignores request-level `tool_resources`.

### Execution Limits and Cancellation

`maxToolIterations` limits callback batches; parallel calls in one response count as one batch. The final answer after the last allowed batch is still returned.

`maxPollTimeMs` starts after the first response and is checked between tool turns. It does not interrupt a request or callback already running. A final answer can arrive after this budget.

`timeoutMs` applies to each request attempt, including authentication and reading the response body. It excludes client setup, agent lookup, and callbacks. Retries can make the total wait longer.

<details>
<summary>Valid limits and JavaScript cancellation</summary>

`timeoutMs` must be a positive integer no greater than `2147483647`. `maxPollTimeMs` must be finite and non-negative. `maxToolIterations` rounds down values in the range `1`–`64`; missing or invalid values use `8`.

JavaScript callers can pass `{ abortSignal: controller.signal }` as the third `callApi` argument. Cancellation stops waiting, aborts the request, and prevents further tool turns. Callbacks receive `context.abortSignal`; pass it to `fetch` or other cancellable work. Shared setup and operations that ignore the signal can continue after cancellation.

</details>

### Error Handling

Failed, cancelled, incomplete, or pending responses return an error with any available partial output and usage. Refusals have `isRefusal: true`; content filtering is reported in guardrails metadata.

Promptfoo retries connection errors, timeouts, and HTTP 408/409/429/5xx responses, subject to server retry hints. It honors delays up to 60 seconds; a longer delay returns the error without provider or scheduler retries. Without a valid delay hint, retries use exponential backoff with jitter.

Quota errors (`metadata.rateLimitKind: 'quota'`) are not retried. Check billing or quota before running the eval again.

<details>
<summary>Retry and quota classification</summary>

Delay hints come from `retry-after-ms` or `Retry-After` (integer seconds or an HTTP date). `x-should-retry` can allow or suppress retries. A retry veto or delay over 60 seconds sets `metadata.rateLimitRetryable: false` so the scheduler does not retry or delay queued calls.

Billing codes such as `credit_balance_exhausted`, `billing_hard_limit_reached`, `billing_not_active`, and `access_terminated` always remain quota errors. `insufficient_quota` and `quota_exceeded` can be treated as recoverable rate limits when a retry or reset hint indicates recovery within one hour. The 60-second retry-delay limit still applies.

</details>

### Response continuity and accounting

<details>
<summary>Conversations and response storage</summary>

Tool outputs continue the latest response using `previous_response_id`. With `passthrough.conversation`, every turn uses that conversation instead. Do not set both `conversation` and `previous_response_id`.

`passthrough.store: false` supports a single request without local callbacks. It cannot be combined with `functionToolCallbacks` because this provider does not carry [stateless tool history](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/runtime-components#generate-a-response-without-storing). Streaming and background requests are unsupported.

</details>

<details>
<summary>Token usage and cost</summary>

Usage and cost include all model turns in a provider call, including turns completed before a later error. `numRequests` counts these turns; `metadata.transportRetries` counts additional request attempts. Separate scheduler retries start new provider calls and do not add earlier usage to these totals.

After a retry, totals are marked incomplete because Azure may not report usage from failed attempts. Missing usage or pricing also sets `metadata.usageIncomplete` or `metadata.costIncomplete`. When cost is incomplete, `cost` is omitted and `metadata.knownCost` holds the known subtotal. Cost uses each response's model; cached and reasoning tokens are subsets of total usage.

</details>

### Caching

Responses are cached by project, agent, request settings, and prompt. Calls with local callbacks, an explicit `maxPollTimeMs`, or conversation linkage bypass the cache. Use `--no-cache` to force fresh responses during testing.

### Environment Variables

| Variable               | Description                                         |
| ---------------------- | --------------------------------------------------- |
| `AZURE_AI_PROJECT_URL` | Project endpoint; overridden by `config.projectUrl` |
| `AZURE_CLIENT_ID`      | Service principal client ID                         |
| `AZURE_CLIENT_SECRET`  | Service principal secret                            |
| `AZURE_TENANT_ID`      | Azure tenant ID                                     |

### Key Differences from Standard Azure Assistants

Foundry uses a project endpoint, agent name, and Azure credentials. Azure OpenAI assistant IDs and API keys belong to the retired Assistants API and cannot be substituted directly.

### When to Use Azure Foundry Agents

Use this provider to test an agent already configured in Foundry. To call a model deployment directly, choose an [Azure chat or Responses provider](#provider-types).

### Example Repository

The [Foundry example](https://github.com/promptfoo/promptfoo/tree/main/examples/azure/foundry-agent) includes a starter config.

## Video Generation (Sora)

The `azure:video:<deployment name>` provider sends text prompts to Azure's legacy Sora jobs API (`/openai/v1/video/generations/jobs`). Use the name assigned to your deployment; promptfoo sends it in the request's `model` field. It also forwards legacy `inpaint_items` for image-to-video requests. The OpenAI video options `input_reference` and `remix_video_id` are not supported by this Azure provider.

:::warning Check the deployed model version

Azure's [retirement schedule](https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/model-retirement-schedule) lists October 15, 2026 for `sora-2` version `2025-12-08`, with no replacement. This differs from the native OpenAI Videos API's September 24 shutdown.

Sora 2 uses a [different Videos API and request schema](https://learn.microsoft.com/en-us/azure/foundry-classic/openai/concepts/video-generation#model-comparison). Changing the deployment name on `azure:video:` does not implement that protocol, and the Sora 2 date does not establish availability of the legacy jobs API. Keep these legacy configurations only for existing deployments whose availability you have verified in Azure.

:::

### Prerequisites

1. An Azure AI Foundry resource in a Sora-supported region (e.g. `eastus2` or `swedencentral`; check the [Azure model availability docs](https://learn.microsoft.com/azure/ai-foundry/openai/concepts/models) for current regions)
2. A Sora model deployment

### Configuration

```yaml
providers:
  - id: azure:video:my-video-deployment
    config:
      apiBaseUrl: https://your-resource.cognitiveservices.azure.com
      # Authentication (choose one):
      apiKey: ${AZURE_API_KEY} # Or use AZURE_API_KEY env var
      # Or use Entra ID (DefaultAzureCredential)

      # Video parameters
      width: 1280 # 480, 720, 854, 1080, 1280, 1920
      height: 720 # 480, 720, 1080
      n_seconds: 5 # 5, 10, 15, 20

      # Polling
      poll_interval_ms: 10000
      max_poll_time_ms: 600000
```

### Supported Dimensions

| Size      | Aspect Ratio     |
| --------- | ---------------- |
| 480x480   | 1:1 (Square)     |
| 720x720   | 1:1 (Square)     |
| 1080x1080 | 1:1 (Square)     |
| 854x480   | 16:9 (Landscape) |
| 1280x720  | 16:9 (Landscape) |
| 1920x1080 | 16:9 (Landscape) |

### Supported Durations

- 5 seconds
- 10 seconds
- 15 seconds
- 20 seconds

### Example

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
providers:
  - azure:video:my-video-deployment

prompts:
  - 'A serene Japanese garden with koi fish swimming in a pond'

tests:
  - vars: {}
    assert:
      - type: javascript
        value: context.providerResponse?.video?.format === 'mp4'
```

### Environment Variables

| Variable              | Description                                         |
| --------------------- | --------------------------------------------------- |
| `AZURE_API_KEY`       | Azure API key                                       |
| `AZURE_API_BASE_URL`  | Resource endpoint URL                               |
| `AZURE_CLIENT_ID`     | Entra ID client ID (for service principal auth)     |
| `AZURE_CLIENT_SECRET` | Entra ID client secret (for service principal auth) |
| `AZURE_TENANT_ID`     | Entra ID tenant ID (for service principal auth)     |

## See Also

- [OpenAI Provider](/docs/providers/openai) - The base provider that Azure shares configuration with
- [Evaluating Assistants](/docs/guides/evaluate-openai-assistants/) - Legacy workflow for Assistants-compatible endpoints
- [Azure Examples](https://github.com/promptfoo/promptfoo/tree/main/examples/azure) - All Azure examples in one place:
  - [OpenAI](https://github.com/promptfoo/promptfoo/tree/main/examples/azure/openai) - Chat, vision, and embedding examples
  - [Claude](https://github.com/promptfoo/promptfoo/tree/main/examples/azure/claude) - Anthropic Claude on Azure AI Foundry
  - [Llama](https://github.com/promptfoo/promptfoo/tree/main/examples/azure/llama) - Meta Llama models
  - [DeepSeek](https://github.com/promptfoo/promptfoo/tree/main/examples/azure/deepseek) - DeepSeek reasoning models
  - [Mistral](https://github.com/promptfoo/promptfoo/tree/main/examples/azure/mistral) - Mistral models
  - [Comparison](https://github.com/promptfoo/promptfoo/tree/main/examples/azure/comparison) - Multi-provider comparison
  - [Assistants](https://github.com/promptfoo/promptfoo/tree/main/examples/azure/assistant) - Archived Azure Assistants configurations
  - [Foundry Agent](https://github.com/promptfoo/promptfoo/tree/main/examples/azure/foundry-agent) - Azure AI Foundry Agents
