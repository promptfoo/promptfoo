---
sidebar_label: Databricks
---

# Databricks (Mosaic AI)

The Databricks provider allows you to interact with Databricks' Mosaic AI serving endpoints using the OpenAI protocol. It supports chat completion models hosted on Databricks' infrastructure.

## Configuration

To use the Databricks provider, you'll need:

1. A Databricks workspace URL
2. A Databricks access token for authentication
3. A configured serving endpoint for your model

Optionally, set up your environment:

```sh
export DATABRICKS_WORKSPACE_URL=https://your-workspace.cloud.databricks.com
export DATABRICKS_TOKEN=your-token-here
```

## Basic Usage

Here's a basic example of how to use the Databricks provider:

```yaml title="promptfooconfig.yaml"
providers:
  - id: databricks:your-endpoint-name
    config:
      workspaceUrl: https://your-workspace.cloud.databricks.com # Optional if DATABRICKS_WORKSPACE_URL is set
```

## Configuration Options

The Databricks provider supports all the standard [OpenAI configuration options](/docs/providers/openai#configuring-parameters) plus these additional Databricks-specific options:

| Parameter      | Description                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------- |
| `workspaceUrl` | The Databricks workspace URL. Can also be set via `DATABRICKS_WORKSPACE_URL` environment variable. |

Example with full configuration:

```yaml
providers:
  - id: databricks:llama-2-70b
    config:
      # Databricks-specific options (set in config or environment variables)
      workspaceUrl: https://your-workspace.cloud.databricks.com
      apiKey: your-token-here

      # Standard OpenAI options
      temperature: 0.7
      max_tokens: 200
      top_p: 1
      frequency_penalty: 0
      presence_penalty: 0
```

## Environment Variables

The following environment variables are supported:

| Variable                   | Description                                        |
| -------------------------- | -------------------------------------------------- |
| `DATABRICKS_WORKSPACE_URL` | The Databricks workspace URL for API requests      |
| `DATABRICKS_TOKEN`         | The authentication token for Databricks API access |

## API Compatibility

The Databricks provider is built on top of the OpenAI protocol, which means it supports the same message format and most of the same parameters as the OpenAI Chat API. This includes:

- Chat message formatting with roles (system, user, assistant)
- Temperature and other generation parameters
- Token limits and other constraints

Example chat conversation:

```yaml title="promptfooconfig.yaml"
prompts:
  - 'You are a helpful assistant. Answer the following question: {{user_input}}'

providers:
  - id: databricks:llama-2-70b
    config:
      temperature: 0.7
      max_tokens: 200

tests:
  - vars:
      user_input: 'What are the key considerations when implementing a machine learning pipeline?'
```

## Troubleshooting

If you encounter issues:

1. Verify your `DATABRICKS_TOKEN` and `DATABRICKS_WORKSPACE_URL` are correctly set
2. Check that your serving endpoint exists and is running
3. Ensure your endpoint name matches the configuration
4. Verify your token has the necessary permissions to access the serving endpoint
5. Check the Databricks workspace logs for any serving endpoint errors
