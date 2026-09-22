---
sidebar_label: JFrog ML
description: "Integrate JFrog's ML model management platform for artifact security scanning, versioning, and DevSecOps compliance"
---

# JFrog ML

:::note Not JFrog Artifactory
This documentation covers the **JFrog ML** provider for AI model inference (formerly known as Qwak). This is different from **JFrog Artifactory**, which is supported in [ModelAudit](/docs/model-audit/usage#jfrog-artifactory) for scanning models stored in artifact repositories.
:::

The JFrog ML provider calls models in JFrog's LLM Model Library using the OpenAI chat protocol.

## Setup

To use the JFrog ML provider, you'll need:

1. A JFrog ML account
2. A JFrog ML token for authentication
3. A deployed model from the JFrog ML Model Library

Set up your environment:

```sh
export QWAK_TOKEN="your-token-here"
```

## Basic Usage

Here's a basic example of how to use the JFrog ML provider:

```yaml title="promptfooconfig.yaml"
providers:
  - id: jfrog:llama_3_8b_instruct
    config:
      temperature: 1.2
      max_tokens: 500
```

You can also use the legacy `qwak:` prefix:

```yaml title="promptfooconfig.yaml"
providers:
  - id: qwak:llama_3_8b_instruct
```

## Configuration Options

The JFrog ML provider supports the standard [OpenAI configuration options](/docs/providers/openai#configuring-parameters) plus these additional JFrog ML-specific options.

By default, the provider uses `<baseUrl>/<model>` as its API base URL and reads the key from
`QWAK_TOKEN`. Set `apiBaseUrl` to supply your own API base URL or `apiKeyEnvar` to read the key
from a different environment variable.

| Parameter | Description                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------------- |
| `baseUrl` | Defaults to `https://models.qwak-prod.qwak.ai/v1`. The provider appends the model name, so leave it out of this URL. |

Example with full configuration:

```yaml title="promptfooconfig.yaml"
providers:
  - id: jfrog:llama_3_8b_instruct
    config:
      # JFrog ML-specific options
      baseUrl: https://models.qwak-prod.qwak.ai/v1

      # Standard OpenAI options
      temperature: 1.2
      max_tokens: 500
      top_p: 1
      frequency_penalty: 0
      presence_penalty: 0
```

## Environment Variables

The following environment variables are supported:

| Variable     | Description                                      |
| ------------ | ------------------------------------------------ |
| `QWAK_TOKEN` | The authentication token for JFrog ML API access |

## API Compatibility

The JFrog ML provider is built on top of the OpenAI protocol, which means it supports the same message format and most of the same parameters as the OpenAI Chat API. This includes:

- Chat message formatting with roles (system, user, assistant)
- Temperature and other generation parameters
- Token limits and other constraints

Example chat conversation:

```yaml title="prompts.yaml"
- role: system
  content: 'You are a helpful assistant.'
- role: user
  content: '{{user_input}}'
```

```yaml title="promptfooconfig.yaml"
prompts:
  - file://prompts.yaml

providers:
  - id: jfrog:llama_3_8b_instruct
    config:
      temperature: 1.2
      max_tokens: 500

tests:
  - vars:
      user_input: 'What should I do for a 4 day vacation in Spain?'
```
