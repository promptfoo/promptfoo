---
sidebar_position: 4
title: Azure OpenAI Provider
description: Configure and use Azure OpenAI models with promptfoo for evals, including GPT-4, reasoning models, and vision capabilities
keywords: [azure, openai, gpt-4, vision, reasoning models, evaluation]
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

### Option 2: Client Credentials Authentication

Set the following environment variables or config properties:

- `AZURE_CLIENT_ID` / `azureClientId`
- `AZURE_CLIENT_SECRET` / `azureClientSecret`
- `AZURE_TENANT_ID` / `azureTenantId`

Optionally, you can also set:

- `AZURE_AUTHORITY_HOST` / `azureAuthorityHost` (defaults to 'https://login.microsoftonline.com')
- `AZURE_TOKEN_SCOPE` / `azureTokenScope` (defaults to 'https://cognitiveservices.azure.com/.default')

Then configure your deployment:

```yaml
providers:
  - id: azure:chat:deploymentNameHere
    config:
      apiHost: 'xxxxxxxx.openai.azure.com'
```

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

- `azure:chat:<deployment name>` - For chat endpoints (e.g., gpt-4o, gpt-4o-mini, gpt-4.1, gpt-4.1-mini, gpt-4.1-nano)
- `azure:completion:<deployment name>` - For completion endpoints (e.g., gpt-35-turbo-instruct)
- `azure:embedding:<deployment name>` - For embedding models (e.g., text-embedding-3-small, text-embedding-3-large)
- `azure:responses:<deployment name>` - For the Responses API (e.g., gpt-4.1, gpt-5, o3-mini)

Vision-capable models (GPT-4o, GPT-4.1) use the standard `azure:chat:` provider type.

## Azure Responses API

The Azure OpenAI Responses API is a stateful API that brings together the best capabilities from chat completions and assistants API in one unified experience. It provides advanced features like MCP servers, code interpreter, and background tasks.

### Using the Responses API

To use the Azure Responses API with promptfoo, use the `azure:responses` provider type:

```yaml
providers:
  # Using the azure:responses alias (recommended)
  - id: azure:responses:gpt-4.1-deployment
    config:
      temperature: 0.7
      instructions: 'You are a helpful assistant.'
      response_format: file://./response-schema.json

  # Or using openai:responses with Azure configuration (legacy method)
  - id: openai:responses:gpt-4.1
    config:
      apiHost: 'your-resource.openai.azure.com'
      apiKey: '${AZURE_API_KEY}'
      temperature: 0.7
      instructions: 'You are a helpful assistant.'
```

### Supported Responses Models

The Responses API supports all Azure OpenAI models:

- **GPT-5 Series**: `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5-chat`
- **GPT-4 Series**: `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`
- **Reasoning Models**: `o1`, `o1-mini`, `o1-pro`, `o3`, `o3-mini`, `o3-pro`, `o4-mini`
- **Specialized Models**: `computer-use-preview`, `gpt-image-1`, `codex-mini-latest`
- **Deep Research Models**: `o3-deep-research`, `o4-mini-deep-research`

### Responses API Features

#### Response Format with External Files

Load complex JSON schemas from external files for better organization:

```yaml
providers:
  - id: openai:responses:gpt-4.1
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

#### Advanced Configuration

**Instructions**: Provide system-level instructions to guide model behavior:

```yaml
config:
  instructions: 'You are a helpful assistant specializing in technical documentation.'
```

**Background Tasks**: Enable asynchronous processing for long-running tasks:

```yaml
config:
  background: true
  store: true
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
        Authorization: 'Bearer ${MCP_API_KEY}'
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
      partial_images: 2 # For streaming partial images
```

### Complete Responses API Example

Here's a comprehensive example using multiple Azure Responses API features:

```yaml
# promptfooconfig.yaml
description: Azure Responses API evaluation

providers:
  # Using the new azure:responses alias (recommended)
  - id: azure:responses:gpt-4.1-deployment
    label: azure-gpt-4.1
    config:
      temperature: 0.7
      max_output_tokens: 2000
      instructions: 'You are a helpful AI assistant.'
      response_format: file://./response-format.json
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
      reasoning_effort: medium
      max_completion_tokens: 4000

prompts:
  - 'Analyze this data and provide insights: {{data}}'
  - 'Write a Python function to solve: {{problem}}'

tests:
  - vars:
      data: 'Sales increased by 25% in Q3 compared to Q2'
    assert:
      - type: contains
        value: 'growth'
      - type: contains
        value: '25%'

  - vars:
      problem: 'Calculate fibonacci sequence up to n terms'
    assert:
      - type: javascript
        value: 'output.includes("def fibonacci") || output.includes("function fibonacci")'
      - type: contains
        value: 'recursive'
```

### Additional Responses API Configuration

**Streaming**: Enable streaming for real-time output:

```yaml
config:
  stream: true
```

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

**Webhook URL**: Set a webhook for async notifications:

```yaml
config:
  webhook_url: 'https://your-webhook.com/callback'
```

### Responses API Limitations

- Web search tool support is still in development
- PDF file upload with `purpose: user_data` requires workaround (use `purpose: assistants`)
- Background mode requires `store: true`
- Some features may have region-specific availability

## Environment Variables

The Azure OpenAI provider supports the following environment variables:

| Environment Variable    | Config Key           | Description                        | Required |
| ----------------------- | -------------------- | ---------------------------------- | -------- |
| `AZURE_API_KEY`         | `apiKey`             | Your Azure OpenAI API key          | No\*     |
| `AZURE_API_HOST`        | `apiHost`            | API host                           | No       |
| `AZURE_API_BASE_URL`    | `apiBaseUrl`         | API base URL                       | No       |
| `AZURE_BASE_URL`        | `apiBaseUrl`         | Alternative API base URL           | No       |
| `AZURE_DEPLOYMENT_NAME` | -                    | Default deployment name            | Yes      |
| `AZURE_CLIENT_ID`       | `azureClientId`      | Azure AD application client ID     | No\*     |
| `AZURE_CLIENT_SECRET`   | `azureClientSecret`  | Azure AD application client secret | No\*     |
| `AZURE_TENANT_ID`       | `azureTenantId`      | Azure AD tenant ID                 | No\*     |
| `AZURE_AUTHORITY_HOST`  | `azureAuthorityHost` | Azure AD authority host            | No       |
| `AZURE_TOKEN_SCOPE`     | `azureTokenScope`    | Azure AD token scope               | No       |

\* Either `AZURE_API_KEY` OR the combination of `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, and `AZURE_TENANT_ID` must be provided.

Note: For API URLs, you only need to set one of `AZURE_API_HOST`, `AZURE_API_BASE_URL`, or `AZURE_BASE_URL`. If multiple are set, the provider will use them in that order of preference.

### Default Deployment

If `AZURE_DEPLOYMENT_NAME` is set, it will be automatically used as the default deployment when no other provider is configured. This makes Azure OpenAI the default provider when:

1. No OpenAI API key is present (`OPENAI_API_KEY` is not set)
2. Azure authentication is configured (either via API key or client credentials)
3. `AZURE_DEPLOYMENT_NAME` is set

For example, if you have these environment variables set:

```bash
AZURE_DEPLOYMENT_NAME=gpt-4o
AZURE_API_KEY=your-api-key
AZURE_API_HOST=your-host.openai.azure.com
```

Or these client credential environment variables:

```bash
AZURE_DEPLOYMENT_NAME=gpt-4o
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

Set this environment variable to the deployment name of your embedding model:

```bash
AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME=text-embedding-3-small
```

This deployment will automatically be used whenever embeddings are required, such as for similarity comparisons or dataset generation. You can also override the embedding provider in your configuration:

```yaml title="promptfooconfig.yaml"
defaultTest:
  options:
    provider:
      embedding:
        id: azure:embedding:text-embedding-3-small-deployment
        config:
          apiHost: 'your-resource.openai.azure.com'
```

Note that any moderation tasks will still use the OpenAI API.

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

## Using Client Credentials

To use client credentials for authentication with Azure, first install the peer dependency:

```sh
npm i @azure/identity
```

Then set the following configuration variables:

```yaml
providers:
  - id: azure:chat:deploymentNameHere
    config:
      apiHost: 'xxxxxxxx.openai.azure.com'
      azureClientId: 'your-azure-client-id'
      azureClientSecret: 'your-azure-client-secret'
      azureTenantId: 'your-azure-tenant-id'
      azureAuthorityHost: 'https://login.microsoftonline.com' # Optional
      azureTokenScope: 'https://cognitiveservices.azure.com/.default' # Optional
```

These credentials will be used to obtain an access token for the Azure OpenAI API.

The `azureAuthorityHost` defaults to 'https://login.microsoftonline.com' if not specified. The `azureTokenScope` defaults to 'https://cognitiveservices.azure.com/.default', the scope required to authenticate with Azure Cognitive Services.

## Model-Graded Tests

[Model-graded assertions](/docs/configuration/expected-outputs/model-graded/) such as `factuality` or `llm-rubric` use `gpt-4.1-2025-04-14` by default. When `AZURE_DEPLOYMENT_NAME` is set (and `OPENAI_API_KEY` is not), promptfoo automatically uses the specified Azure deployment for grading. You can also explicitly override the grader as shown below.

The easiest way to do this for _all_ your test cases is to add the [`defaultTest`](/docs/configuration/guide/#default-test-cases) property to your config:

```yaml title="promptfooconfig.yaml"
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

```yaml title="promptfooconfig.yaml"
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

```yaml title="promptfooconfig.yaml"
defaultTest:
  options:
    provider:
      embedding:
        id: azure:embedding:text-embedding-3-small-deployment
        config:
          apiHost: 'your-resource.openai.azure.com'
```

## AI Services

You may also specify `deployment_id` and `dataSources`, used to integrate with the [Azure AI Search API](https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/use-your-data#conversation-history-for-better-results).

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

(The inconsistency in naming convention between `deployment_id` and `dataSources` reflects the actual naming in the Azure API.)

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

| Name                  | Description                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| o1                    | Set to `true` if your Azure deployment uses an o1 model. **(Deprecated, use `isReasoningModel` instead)**                   |
| isReasoningModel      | Set to `true` if your Azure deployment uses a reasoning model (o1, o3, o3-mini, o4-mini). **Required for reasoning models** |
| max_completion_tokens | Maximum tokens to generate for reasoning models. Only used when `isReasoningModel` is `true`                                |
| reasoning_effort      | Controls reasoning depth: 'low', 'medium', or 'high'. Only used when `isReasoningModel` is `true`                           |
| temperature           | Controls randomness (0-2). Not supported for reasoning models                                                               |
| max_tokens            | Maximum tokens to generate. Not supported for reasoning models                                                              |
| top_p                 | Controls nucleus sampling (0-1)                                                                                             |
| frequency_penalty     | Penalizes repeated tokens (-2 to 2)                                                                                         |
| presence_penalty      | Penalizes new tokens based on presence (-2 to 2)                                                                            |
| best_of               | Generates multiple outputs and returns the best                                                                             |
| functions             | Array of functions available for the model to call                                                                          |
| function_call         | Controls how the model calls functions                                                                                      |
| response_format       | Specifies output format (e.g., `{ type: "json_object" }`)                                                                   |
| stop                  | Array of sequences where the model will stop generating                                                                     |
| passthrough           | Additional parameters to send with the request                                                                              |

## Using Reasoning Models (o1, o3, o3-mini, o4-mini)

Azure OpenAI now supports reasoning models like `o1`, `o3`, `o3-mini`, and `o4-mini`. These models operate differently from standard models with specific requirements:

1. They use `max_completion_tokens` instead of `max_tokens`
2. They don't support `temperature` (it's ignored)
3. They accept a `reasoning_effort` parameter ('low', 'medium', 'high')

Since Azure allows custom deployment names that don't necessarily reflect the underlying model type, you must explicitly set the `isReasoningModel` flag to `true` in your configuration when using reasoning models. This works with both chat and completion endpoints:

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
      # Optional: Set reasoning effort (default is 'medium')
      reasoning_effort: 'medium'

# For completion endpoints
providers:
  - id: azure:completion:my-o3-deployment
    config:
      apiHost: 'xxxxxxxx.openai.azure.com'
      isReasoningModel: true
      max_completion_tokens: 25000
      reasoning_effort: 'high'
```

> Note: The `o1` flag is still supported for backward compatibility, but `isReasoningModel` is preferred as it more clearly indicates its purpose.

### Using Variables with Reasoning Effort

You can use variables in your configuration to dynamically adjust the reasoning effort based on your test cases:

```yaml
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

If you encounter this error when using reasoning models:

```
API response error: unsupported_parameter Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
```

This means you're using a reasoning model without setting the `isReasoningModel` flag. Update your config as shown above.

## Using Vision Models

Azure OpenAI supports vision-capable models like GPT-4o and GPT-4.1 for image analysis.

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

See the [azure-openai example](https://github.com/promptfoo/promptfoo/tree/main/examples/azure-openai) for a complete working example with image analysis. Use `promptfooconfig.vision.yaml` for vision-specific features.

## Using DeepSeek Models

Azure AI supports DeepSeek models such as DeepSeek-R1. Like other reasoning models, these require specific configuration:

1. Set `isReasoningModel: true`
2. Use `max_completion_tokens` instead of `max_tokens`
3. Set API version to '2025-04-01-preview' (or latest available)

```yaml title="promptfooconfig.yaml"
providers:
  - id: azure:chat:DeepSeek-R1
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
      id: azure:chat:DeepSeek-R1
      config:
        apiHost: 'your-deployment-name.services.ai.azure.com'
        apiVersion: '2025-04-01-preview'
        isReasoningModel: true
        max_completion_tokens: 2048
```

Adjust `reasoning_effort` to control response quality vs. speed: `low` for faster responses, `medium` for balanced performance (default), or `high` for more thorough reasoning on complex tasks.

## Assistants

To evaluate an OpenAI assistant on Azure:

1. Create a deployment for the assistant in the Azure portal
2. Create an assistant in the Azure web UI
3. Install the peer dependency:

```sh
npm i @azure/openai-assistants
```

4. Configure your provider with the assistant ID:

```yaml
providers:
  - id: azure:assistant:asst_E4GyOBYKlnAzMi19SZF2Sn8I
    config:
      apiHost: yourdeploymentname.openai.azure.com
```

Replace the assistant ID and deployment name with your actual values.

### Function Tools with Assistants

Azure OpenAI Assistants support custom function tools. You can define functions in your configuration and provide callback implementations to handle them:

```yaml
providers:
  - id: azure:assistant:your_assistant_id
    config:
      apiHost: your-resource-name.openai.azure.com
      # Load function tool definition
      tools: file://tools/weather-function.json
      # Define function callback inline
      functionToolCallbacks:
        # Use an external file
        get_weather: file://callbacks/weather.js:getWeather
        # Or use an inline function
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

Azure OpenAI Assistants support vector stores for enhanced file search capabilities. To use a vector store:

1. Create a vector store in the Azure Portal or via the API
2. Configure your assistant to use it:

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

Key requirements:

- Set up a tool with `type: file_search`
- Configure the `tool_resources.file_search.vector_store_ids` array with your vector store IDs
- Set the appropriate `apiVersion` (recommended: `2025-04-01-preview` or later)

### Simple Example

Here's an example of a simple full assistant eval:

```yaml
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

For complete working examples of Azure OpenAI Assistants with various tool configurations, check out the [azure-openai-assistant example directory](https://github.com/promptfoo/promptfoo/tree/main/examples/azure-openai-assistant).

See the guide on [How to evaluate OpenAI assistants](/docs/guides/evaluate-openai-assistants/) for more information on how to compare different models, instructions, and more.

## See Also

- [OpenAI Provider](/docs/providers/openai) - The base provider that Azure shares configuration with
- [Evaluating Assistants](/docs/guides/evaluate-openai-assistants/) - Learn how to compare different models and instructions
- [Azure OpenAI Assistant Examples](https://github.com/promptfoo/promptfoo/tree/main/examples/azure-openai-assistant) - Complete working examples with various tool configurations
- [Azure OpenAI Example](https://github.com/promptfoo/promptfoo/tree/main/examples/azure-openai) - Example configurations including vision model support
