---
sidebar_label: Cloudera
---

# Cloudera

The Cloudera provider allows you to interact with Cloudera's AI endpoints using the OpenAI protocol. It supports chat completion models hosted on Cloudera's infrastructure.

## Configuration

To use the Cloudera provider, you'll need:

1. A Cloudera domain
2. A CDP token for authentication
3. (Optional) A namespace and endpoint configuration

Set up your environment:

```sh
export CDP_DOMAIN=your-domain-here
export CDP_TOKEN=your-token-here
```

## Basic Usage

Here's a basic example of how to use the Cloudera provider:

```yaml title="promptfooconfig.yaml"
providers:
  - id: cloudera:your-model-name
    config:
      domain: your-domain # Optional if CDP_DOMAIN is set
      namespace: serving-default # Optional, defaults to 'serving-default'
      endpoint: your-endpoint # Optional, defaults to model name
```

## Configuration Options

The Cloudera provider supports all the standard [OpenAI configuration options](/docs/providers/openai#configuring-parameters) plus these additional Cloudera-specific options:

| Parameter   | Description                                                                        |
| ----------- | ---------------------------------------------------------------------------------- |
| `domain`    | The Cloudera domain to use. Can also be set via `CDP_DOMAIN` environment variable. |
| `namespace` | The namespace to use. Defaults to 'serving-default'.                               |
| `endpoint`  | The endpoint to use. Defaults to the model name if not specified.                  |

Example with full configuration:

```yaml
providers:
  - id: cloudera:llama-3-1
    config:
      # Cloudera-specific options
      domain: your-domain
      namespace: serving-default
      endpoint: llama-3-1

      # Standard OpenAI options
      temperature: 0.7
      max_tokens: 200
      top_p: 1
      frequency_penalty: 0
      presence_penalty: 0
```

## Environment Variables

The following environment variables are supported:

| Variable     | Description                                      |
| ------------ | ------------------------------------------------ |
| `CDP_DOMAIN` | The Cloudera domain to use for API requests      |
| `CDP_TOKEN`  | The authentication token for Cloudera API access |

## API Compatibility

The Cloudera provider is built on top of the OpenAI protocol, which means it supports the same message format and most of the same parameters as the OpenAI Chat API. This includes:

- Chat message formatting with roles (system, user, assistant)
- Temperature and other generation parameters
- Token limits and other constraints

Example chat conversation:

```yaml title="promptfooconfig.yaml"
prompts:
  - 'You are a helpful assistant. Answer the following question: {{user_input}}'

providers:
  - id: cloudera:llama-3-1
    config:
      temperature: 0.7
      max_tokens: 200

tests:
  - vars:
      user_input: 'What should I do for a 4 day vacation in Spain?'
```

## Troubleshooting

If you encounter issues:

1. Verify your `CDP_TOKEN` and `CDP_DOMAIN` are correctly set
2. Check that the namespace and endpoint exist and are accessible
3. Ensure your model name matches the endpoint configuration
4. Verify your token has the necessary permissions to access the endpoint
