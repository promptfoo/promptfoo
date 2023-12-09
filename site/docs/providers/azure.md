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

The `similar` assertion type requires an embedding model such as `text-embedding-ada-002`.  Be sure to specify a deployment with an embedding model, not a chat model, when overriding the grader.

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
