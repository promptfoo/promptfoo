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

[Model-graded assertions](/docs/configuration/expected-outputs/model-graded/) such as `factuality` or `llm-rubric` use OpenAI by default. If you are using Azure, you must override the grader to point to your Azure deployment.

The easiest way to do this for _all_ your test cases is to add the [`defaultTest`](/docs/configuration/guide/#default-test-cases) property to your config:

```yaml title=promptfooconfig.yaml
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

| Name                  | Description                                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| o1                    | Set to `true` if your Azure deployment uses an o1 model. Since Azure allows custom model naming, this flag is required to properly handle o1 models which do not support certain parameters. |
| max_completion_tokens | Maximum number of tokens to generate for o1 models. Only used when `o1` is set to `true`.                                                                                                    |
| reasoning_effort      | Allows you to control how long the o1 model thinks before answering, 'low', 'medium' or 'high'. Only used when `o1` is set to `true`.                                                        |
| temperature           | Controls randomness of the output. Not supported for o1 models and will be automatically excluded when `o1` is `true`.                                                                       |
| max_tokens            | Maximum number of tokens to generate. Not supported for o1 models and will be automatically excluded when `o1` is `true`.                                                                    |
| top_p                 | Controls nucleus sampling.                                                                                                                                                                   |
| frequency_penalty     | Penalizes new tokens based on their frequency.                                                                                                                                               |
| presence_penalty      | Penalizes new tokens based on their presence.                                                                                                                                                |
| best_of               | Generates multiple outputs and chooses the best.                                                                                                                                             |
| functions             | Specifies functions available for use.                                                                                                                                                       |
| function_call         | Controls automatic function calling.                                                                                                                                                         |
| response_format       | Specifies the format of the response.                                                                                                                                                        |
| stop                  | Specifies stop sequences for the generation.                                                                                                                                                 |
| passthrough           | Anything under `passthrough` will be sent as a top-level request param                                                                                                                       |

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

Here's an example of a simple full assistant eval:

```yaml
prompts:
  - 'Write a tweet about {{topic}}'

providers:
  - id: azure:assistant:asst_E4GyOBYKlnAzMi19SZF2Sn8I
    config:
      apiHost: yourdeploymentname.openai.azure.com

tests:
  - vars:
      topic: bananas
```

See the guide on [How to eval OpenAI assistants](/docs/guides/evaluate-openai-assistants/) for more information on how to compare different models, instructions, and more.
