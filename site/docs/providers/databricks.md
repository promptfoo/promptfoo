---
sidebar_label: Databricks
description: Configure Databricks Foundation Model APIs with Llama-3, Claude, and custom endpoints for unified access to hosted and external LLMs through OpenAI-compatible interface
---

# Databricks Foundation Model APIs

The Databricks provider integrates with Databricks' Foundation Model APIs, offering access to state-of-the-art models through a unified OpenAI-compatible interface. It supports multiple deployment modes to match your specific use case and performance requirements.

## Overview

Databricks Foundation Model APIs provide three main deployment options:

1. **Pay-per-token endpoints**: Pre-configured endpoints for popular models with usage-based pricing
2. **Provisioned throughput**: Dedicated endpoints with guaranteed performance for production workloads
3. **External models**: Unified access to models from providers like OpenAI, Anthropic, and Google through Databricks

## Prerequisites

1. A Databricks workspace with Foundation Model APIs enabled
2. A Databricks access token for authentication
3. Your workspace URL (e.g., `https://your-workspace.cloud.databricks.com`)

Set up your environment:

```sh
export DATABRICKS_WORKSPACE_URL=https://your-workspace.cloud.databricks.com
export DATABRICKS_TOKEN=your-token-here
```

## Basic Usage

### Pay-per-token Endpoints

Access pre-configured Foundation Model endpoints with simple configuration:

```yaml title="promptfooconfig.yaml"
providers:
  - id: databricks:databricks-meta-llama-3-3-70b-instruct
    config:
      isPayPerToken: true
      workspaceUrl: https://your-workspace.cloud.databricks.com
```

Available pay-per-token models include:

- `databricks-meta-llama-3-3-70b-instruct` - Meta's latest Llama model
- `databricks-claude-3-7-sonnet` - Anthropic Claude with reasoning capabilities
- `databricks-gte-large-en` - Text embeddings model
- `databricks-dbrx-instruct` - Databricks' own foundation model

### Provisioned Throughput Endpoints

For production workloads requiring guaranteed performance:

```yaml
providers:
  - id: databricks:my-custom-endpoint
    config:
      workspaceUrl: https://your-workspace.cloud.databricks.com
      temperature: 0.7
      max_tokens: 500
```

### External Models

Access external models through Databricks' unified API:

```yaml
providers:
  - id: databricks:my-openai-endpoint
    config:
      workspaceUrl: https://your-workspace.cloud.databricks.com
      # External model endpoints proxy to providers like OpenAI, Anthropic, etc.
```

## Configuration Options

The Databricks provider extends the [OpenAI configuration options](/docs/providers/openai#configuring-parameters) with these Databricks-specific features:

| Parameter         | Description                                                                                   | Default |
| ----------------- | --------------------------------------------------------------------------------------------- | ------- |
| `workspaceUrl`    | Databricks workspace URL. Can also be set via `DATABRICKS_WORKSPACE_URL` environment variable | -       |
| `isPayPerToken`   | Whether this is a pay-per-token endpoint (true) or custom deployed endpoint (false)           | false   |
| `usageContext`    | Optional metadata for usage tracking and cost attribution                                     | -       |
| `aiGatewayConfig` | AI Gateway features configuration (safety filters, PII handling)                              | -       |

### Advanced Configuration

```yaml title="promptfooconfig.yaml"
providers:
  - id: databricks:databricks-claude-3-7-sonnet
    config:
      isPayPerToken: true
      workspaceUrl: https://your-workspace.cloud.databricks.com

      # Standard OpenAI parameters
      temperature: 0.7
      max_tokens: 2000
      top_p: 0.9

      # Usage tracking for cost attribution
      usageContext:
        project: 'customer-support'
        team: 'engineering'
        environment: 'production'

      # AI Gateway features (if enabled on endpoint)
      aiGatewayConfig:
        enableSafety: true
        piiHandling: 'mask' # Options: none, block, mask
```

## Environment Variables

| Variable                   | Description                                    |
| -------------------------- | ---------------------------------------------- |
| `DATABRICKS_WORKSPACE_URL` | Your Databricks workspace URL                  |
| `DATABRICKS_TOKEN`         | Authentication token for Databricks API access |

## Features

### Vision Models

Vision models on Databricks require structured JSON prompts similar to OpenAI's format. Here's how to use them:

```yaml title="promptfooconfig.yaml"
prompts:
  - file://vision-prompt.json

providers:
  - id: databricks:databricks-claude-3-7-sonnet
    config:
      isPayPerToken: true

tests:
  - vars:
      question: "What's in this image?"
      image_url: 'https://example.com/image.jpg'
```

Create a `vision-prompt.json` file with the proper format:

```json title="vision-prompt.json"
[
  {
    "role": "user",
    "content": [
      {
        "type": "text",
        "text": "{{question}}"
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
```

### Structured Outputs

Get responses in a specific JSON schema:

```yaml
providers:
  - id: databricks:databricks-meta-llama-3-3-70b-instruct
    config:
      isPayPerToken: true
      response_format:
        type: 'json_schema'
        json_schema:
          name: 'product_info'
          schema:
            type: 'object'
            properties:
              name:
                type: 'string'
              price:
                type: 'number'
            required: ['name', 'price']
```

## Monitoring and Usage Tracking

Track usage and costs with detailed context:

```yaml
providers:
  - id: databricks:databricks-meta-llama-3-3-70b-instruct
    config:
      isPayPerToken: true
      usageContext:
        application: 'chatbot'
        customer_id: '12345'
        request_type: 'support_query'
        priority: 'high'
```

Usage data is available through Databricks system tables:

- `system.serving.endpoint_usage` - Token usage and request metrics
- `system.serving.served_entities` - Endpoint metadata

## Best Practices

1. **Choose the right deployment mode**:
   - Use pay-per-token for experimentation and low-volume use cases
   - Use provisioned throughput for production workloads requiring SLAs
   - Use external models when you need specific providers' capabilities

2. **Enable AI Gateway features** for production endpoints:
   - Safety guardrails prevent harmful content
   - PII detection protects sensitive data
   - Rate limiting controls costs and prevents abuse

3. **Implement proper error handling**:
   - Pay-per-token endpoints may have rate limits
   - Provisioned endpoints may have token-per-second limits
   - External model endpoints inherit provider-specific limitations

## Example: Multi-Model Comparison

```yaml title="promptfooconfig.yaml"
prompts:
  - 'Explain quantum computing to a 10-year-old'

providers:
  # Databricks native model
  - id: databricks:databricks-meta-llama-3-3-70b-instruct
    config:
      isPayPerToken: true
      temperature: 0.7

  # External model via Databricks
  - id: databricks:my-gpt4-endpoint
    config:
      temperature: 0.7

  # Custom deployed model
  - id: databricks:my-finetuned-llama
    config:
      temperature: 0.7

tests:
  - assert:
      - type: llm-rubric
        value: 'Response should be simple, clear, and use age-appropriate analogies'
```

## Troubleshooting

Common issues and solutions:

1. **Authentication errors**: Verify your `DATABRICKS_TOKEN` has the necessary permissions
2. **Endpoint not found**:
   - For pay-per-token: Ensure you're using the exact endpoint name (e.g., `databricks-meta-llama-3-3-70b-instruct`)
   - For custom endpoints: Verify the endpoint exists and is running
3. **Rate limiting**: Pay-per-token endpoints have usage limits; consider provisioned throughput for high-volume use
4. **Token count errors**: Some models have specific token limits; adjust `max_tokens` accordingly

## Additional Resources

- [Databricks Foundation Model APIs documentation](https://docs.databricks.com/en/machine-learning/foundation-models/index.html)
- [Supported models and regions](https://docs.databricks.com/en/machine-learning/foundation-models/supported-models.html)
- [AI Gateway configuration](https://docs.databricks.com/en/ai-gateway/index.html)
- [Unity Catalog model management](https://docs.databricks.com/en/machine-learning/manage-model-lifecycle/index.html)
