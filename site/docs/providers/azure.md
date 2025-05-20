---
sidebar_position: 4
---

# Azure

The `azure` provider is an interface to Azure. It shares configuration settings with the [OpenAI provider](/docs/providers/openai).

## Setup

There are two ways to authenticate with Azure:

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

- AZURE_TOKEN_SCOPE / azureTokenScope (defaults to 'https://cognitiveservices.azure.com/.default')

Then configure your deployment:

```yaml
providers:
  - id: azure:chat:deploymentNameHere
    config:
      apiHost: 'xxxxxxxx.openai.azure.com'
```

## Provider Types

- `azure:chat:<deployment name>` - uses the given deployment (for chat endpoints such as gpt-35-turbo, gpt-4)
- `azure:completion:<deployment name>` - uses the given deployment (for completion endpoints such as gpt-35-instruct)

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
AZURE_DEPLOYMENT_NAME=gpt-4
AZURE_API_KEY=your-api-key
AZURE_API_HOST=your-host.openai.azure.com
```

Or these client credential environment variables:

```bash
AZURE_DEPLOYMENT_NAME=gpt-4
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

Because embedding models are distinct from text generation, to set an embedding provider you must specify `AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME`.

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

## Using client credentials

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

You must also install a peer dependency from Azure:

```sh
npm i @azure/identity
```

## Model-graded tests

[Model-graded assertions](/docs/configuration/expected-outputs/model-graded/) such as `factuality` or `llm-rubric` use `gpt-4.1-2025-04-14` by default. If you are using Azure, you must override the grader to point to your Azure deployment.

The easiest way to do this for _all_ your test cases is to add the [`defaultTest`](/docs/configuration/guide/#default-test-cases) property to your config:

```yaml title="promptfooconfig.yaml"
defaultTest:
  options:
    provider:
      id: azure:chat:gpt-4-deployment-name
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

### Similarity

The `similar` assertion type requires an embedding model such as `text-embedding-ada-002`. Be sure to specify a deployment with an embedding model, not a chat model, when overriding the grader.

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

## Configuration

These properties can be set under the provider `config` key`:

General config

| Name       | Description                                 |
| ---------- | ------------------------------------------- |
| apiHost    | API host.                                   |
| apiBaseUrl | Base URL of the API (used instead of host). |
| apiKey     | API key.                                    |
| apiVersion | API version.                                |

Azure-specific config

| Name               | Description                                                     |
| ------------------ | --------------------------------------------------------------- |
| azureClientId      | Azure identity client ID.                                       |
| azureClientSecret  | Azure identity client secret.                                   |
| azureTenantId      | Azure identity tenant ID.                                       |
| azureAuthorityHost | Azure identity authority host.                                  |
| azureTokenScope    | Azure identity token scope.                                     |
| deployment_id      | Azure cognitive services deployment ID.                         |
| dataSources        | Azure cognitive services parameter for specifying data sources. |

OpenAI config:

| Name                  | Description                                                                                                                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| o1                    | Set to `true` if your Azure deployment uses an o1 model. Since Azure allows custom model naming, this flag is required to properly handle o1 models which do not support certain parameters. **(Deprecated, use `isReasoningModel` instead)** |
| isReasoningModel      | Set to `true` if your Azure deployment uses a reasoning model (o1, o3-mini, etc.). This is the preferred flag over the deprecated `o1` flag.                                                                                                  |
| max_completion_tokens | Maximum number of tokens to generate for reasoning models. Only used when `isReasoningModel` or `o1` is set to `true`.                                                                                                                        |
| reasoning_effort      | Allows you to control how long the reasoning model thinks before answering, 'low', 'medium' or 'high'. Only used when `isReasoningModel` or `o1` is set to `true`.                                                                            |
| temperature           | Controls randomness of the output. Not supported for reasoning models and will be automatically excluded when `isReasoningModel` or `o1` is `true`.                                                                                           |
| max_tokens            | Maximum number of tokens to generate. Not supported for reasoning models and will be automatically excluded when `isReasoningModel` or `o1` is `true`.                                                                                        |
| top_p                 | Controls nucleus sampling.                                                                                                                                                                                                                    |
| frequency_penalty     | Penalizes new tokens based on their frequency.                                                                                                                                                                                                |
| presence_penalty      | Penalizes new tokens based on their presence.                                                                                                                                                                                                 |
| best_of               | Generates multiple outputs and chooses the best.                                                                                                                                                                                              |
| functions             | Specifies functions available for use.                                                                                                                                                                                                        |
| function_call         | Controls automatic function calling.                                                                                                                                                                                                          |
| response_format       | Specifies the format of the response.                                                                                                                                                                                                         |
| stop                  | Specifies stop sequences for the generation.                                                                                                                                                                                                  |
| passthrough           | Anything under `passthrough` will be sent as a top-level request param                                                                                                                                                                        |

## Using Reasoning Models (o1, o3-mini)

Azure OpenAI now supports reasoning models like `o1` and `o3-mini`. These models operate differently from standard models with specific requirements:

1. They use `max_completion_tokens` instead of `max_tokens`
2. They don't support `temperature` (it's ignored)
3. They accept a `reasoning_effort` parameter ('low', 'medium', 'high')

Since Azure allows custom deployment names that don't necessarily reflect the underlying model type, you must explicitly set the `isReasoningModel` flag to `true` in your configuration when using reasoning models. This works with both chat and completion endpoints:

```yaml
# For chat endpoints
providers:
  - id: azure:chat:my-o3-mini-deployment
    config:
      apiHost: 'xxxxxxxx.openai.azure.com'
      # Set this flag to true for reasoning models (o1, o3-mini)
      isReasoningModel: true
      # Use max_completion_tokens instead of max_tokens
      max_completion_tokens: 25000
      # Optional: Set reasoning effort (default is 'medium')
      reasoning_effort: 'medium'

# For completion endpoints
providers:
  - id: azure:completion:my-o1-deployment
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
  - id: azure:chat:my-o3-mini-deployment
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

### Environment Variables

These parameters can be configured directly in your configuration file as shown above.

### Troubleshooting

If you encounter this error when using reasoning models:

```
API response error: unsupported_parameter Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
```

This means you're using a reasoning model without setting the `isReasoningModel` flag. Update your config as shown above.

## Using DeepSeek Models

Azure AI supports DeepSeek models such as DeepSeek-R1. Like other reasoning models, these require specific configuration:

1. Set `isReasoningModel: true`
2. Use `max_completion_tokens` instead of `max_tokens`
3. Set API version to '2024-05-01-preview' (or latest available)

```yaml title="promptfooconfig.yaml"
providers:
  - id: azure:chat:DeepSeek-R1
    config:
      apiHost: 'your-deployment-name.services.ai.azure.com'
      apiVersion: '2024-05-01-preview'
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
        apiVersion: '2024-05-01-preview'
        isReasoningModel: true
        max_completion_tokens: 2048
```

Adjust `reasoning_effort` to control response quality vs. speed: `low` for faster responses, `medium` for balanced performance (default), or `high` for more thorough reasoning on complex tasks.

## Assistants

To eval an OpenAI assistant on Azure, first create a deployment for the assistant and create an assistant in the Azure web UI.

Then install the peer dependency locally:

```sh
npm i @azure/openai-assistants
```

Next, record the assistant ID and set up your provider like so:

```yaml
providers:
  - id: azure:assistant:asst_E4GyOBYKlnAzMi19SZF2Sn8I
    config:
      apiHost: yourdeploymentname.openai.azure.com
```

Be sure to replace the assistant ID and the name of your deployment.

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

Azure OpenAI Assistants support vector stores for enhanced file search capabilities. To use a vector store with your assistant, first create a vector store in the Azure Portal or via the API, then configure your assistant to use it:

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
      apiVersion: '2024-05-01-preview'
```

Make sure to:

1. Set up a tool with `type: file_search`
2. Configure the `tool_resources.file_search.vector_store_ids` array with your vector store IDs
3. Set the appropriate `apiVersion` (recommended: `2024-05-01-preview` or later)

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

See the guide on [How to eval OpenAI assistants](/docs/guides/evaluate-openai-assistants/) for more information on how to compare different models, instructions, and more.

## See Also

- [OpenAI Provider](/docs/providers/openai) - The base provider that Azure shares configuration with
- [Evaluating Assistants](/docs/guides/evaluate-openai-assistants/) - Learn how to compare different models and instructions
- [Azure OpenAI Assistant Examples](https://github.com/promptfoo/promptfoo/tree/main/examples/azure-openai-assistant) - Complete working examples with various tool configurations
