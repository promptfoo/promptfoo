---
sidebar_position: 20
---

# Azure

The `azureopenai` provider is an interface to OpenAI through Azure. It behaves the same as the [OpenAI provider](/docs/providers/openai).

## Setup

First, set the `AZURE_OPENAI_API_KEY` environment variable.

Next, edit the promptfoo configuration file to point to the Azure provider.

- `azureopenai:chat:<deployment name>` - uses the given deployment (for chat endpoints such as gpt-35-turbo, gpt-4)
- `azureopenai:completion:<deployment name>` - uses the given deployment (for completion endpoints such as gpt-35-instruct)

Also set the `apiHost` value to point to your endpoint:

```yaml
providers:
  - id: azureopenai:chat:deploymentNameHere
    config:
      apiHost: 'xxxxxxxx.openai.azure.com'
```

Additional config parameters are passed like so:

```yaml
providers:
  - id: azureopenai:chat:deploymentNameHere
    config:
      apiHost: 'xxxxxxxx.openai.azure.com'
      // highlight-start
      temperature: 0.5
      max_tokens: 1024
      // highlight-end
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
  - id: azureopenai:chat:deploymentNameHere
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

```
npm i @azure/identity
```

## Model-graded tests

[Model-graded assertions](/docs/configuration/expected-outputs/model-graded/) such as `factuality` or `llm-rubric` use OpenAI by default. If you are using Azure, you must override the grader to point to your Azure deployment.

The easiest way to do this for _all_ your test cases is to add the [`defaultTest`](/docs/configuration/guide/#default-test-cases) property to your config:

```yaml title=promptfooconfig.yaml
defaultTest:
  options:
    provider:
      id: azureopenai:chat:gpt-4-deployment-name
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
      id: azureopenai:chat:xxxx
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
        id: azureopenai:chat:xxxx
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
  - id: azureopenai:chat:deploymentNameHere
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

| Name              | Description                                                            |
| ----------------- | ---------------------------------------------------------------------- |
| temperature       | Controls randomness of the output.                                     |
| top_p             | Controls nucleus sampling.                                             |
| frequency_penalty | Penalizes new tokens based on their frequency.                         |
| presence_penalty  | Penalizes new tokens based on their presence.                          |
| best_of           | Generates multiple outputs and chooses the best.                       |
| functions         | Specifies functions available for use.                                 |
| function_call     | Controls automatic function calling.                                   |
| response_format   | Specifies the format of the response.                                  |
| stop              | Specifies stop sequences for the generation.                           |
| passthrough       | Anything under `passthrough` will be sent as a top-level request param |

## Assistants

To eval an OpenAI assistant on Azure, first create a deployment for the assistant and create an assistant in the Azure web UI.

Then install the peer dependency locally:

```sh
npm i @azure/openai-assistants
```

Next, record the assistant ID and set up your provider like so:

```yaml
providers:
  - id: azureopenai:assistant:asst_E4GyOBYKlnAzMi19SZF2Sn8I
    config:
      apiHost: yourdeploymentname.openai.azure.com
```

Be sure to replace the assistant ID and the name of your deployment.

Here's an example of a simple full assistant eval:

```yaml
prompts:
  - 'Write a tweet about {{topic}}'

providers:
  - id: azureopenai:assistant:asst_E4GyOBYKlnAzMi19SZF2Sn8I
    config:
      apiHost: yourdeploymentname.openai.azure.com

tests:
  - vars:
      topic: bananas
```

See the guide on [How to eval OpenAI assistants](/docs/guides/evaluate-openai-assistants/) for more information on how to compare different models, instructions, and more.
