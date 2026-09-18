---
sidebar_label: JFrog ML
description: "Integrate JFrog's ML model management platform for artifact security scanning, versioning, and DevSecOps compliance"
---

# JFrog ML

:::note Not JFrog Artifactory
This documentation covers the **JFrog ML** provider for AI model inference (formerly known as Qwak). This is different from **JFrog Artifactory**, which is supported in [ModelAudit](/docs/model-audit/usage#jfrog-artifactory) for scanning models stored in artifact repositories.
:::

The JFrog ML provider (formerly known as Qwak) allows you to interact with JFrog ML's LLM Model Library using the OpenAI protocol. It supports chat completion models hosted on JFrog ML's infrastructure.

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

When `apiBaseUrl` is not set, the provider builds it as `<baseUrl>/<model>`; `apiKeyEnvar`
defaults to `QWAK_TOKEN`. Setting either explicitly overrides the default.

| Parameter | Description                                                                                                                                                                                                                                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseUrl` | Optional. Host prefix for the request. The model name is appended to it, so the final URL is `<baseUrl>/<model>`. Defaults to `https://models.qwak-prod.qwak.ai/v1`. Do not include the model name here, or it is sent twice. Set `apiBaseUrl` instead to supply the full URL yourself. |

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
