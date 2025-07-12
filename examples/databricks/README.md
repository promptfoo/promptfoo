# Databricks Foundation Model APIs Example

This example demonstrates how to use promptfoo with Databricks Foundation Model APIs, showcasing the various deployment modes and features available in 2025.

## Features Demonstrated

- **Pay-per-token endpoints**: Pre-configured models like Llama 3.3 and Claude
- **Provisioned throughput**: Custom deployed models via Unity Catalog
- **External models**: Unified access to OpenAI, Anthropic, etc.
- **AI Gateway features**: Safety guardrails and PII handling
- **Vision models**: Image analysis with proper JSON formatting

## Prerequisites

1. A Databricks workspace with Foundation Model APIs enabled
2. A Databricks access token
3. Access to the models you want to test

## Setup

1. Set your environment variables:

```bash
export DATABRICKS_WORKSPACE_URL=https://your-workspace.cloud.databricks.com
export DATABRICKS_TOKEN=your-databricks-token
```

2. Update the `promptfooconfig.yaml` file:
   - Replace `your-workspace.cloud.databricks.com` with your actual workspace URL
   - Update endpoint names for your custom/external models

## Running the Examples

### Basic Text Generation

```bash
# Run all tests
npx promptfoo@latest eval

# Run with specific providers
npx promptfoo@latest eval -p databricks:databricks-meta-llama-3-3-70b-instruct

# View results in the web UI
npx promptfoo@latest view
```

### Vision Model Example

For vision models, use the dedicated configuration:

```bash
# Run vision model tests
npx promptfoo@latest eval -c promptfooconfig.vision.yaml

# View results
npx promptfoo@latest view
```

## Configuration Details

### Pay-per-token Endpoints

These are pre-configured endpoints available in your workspace:

```yaml
providers:
  - id: databricks:databricks-meta-llama-3-3-70b-instruct
    config:
      isPayPerToken: true  # Required for pay-per-token endpoints
      workspaceUrl: https://your-workspace.cloud.databricks.com
```

Available models:
- `databricks-meta-llama-3-3-70b-instruct`
- `databricks-claude-3-7-sonnet`
- `databricks-gte-large-en` (embeddings)
- `databricks-dbrx-instruct`

### Custom Provisioned Endpoints

For production workloads with guaranteed performance:

```yaml
providers:
  - id: databricks:my-custom-endpoint
    config:
      workspaceUrl: https://your-workspace.cloud.databricks.com
      # No isPayPerToken flag (defaults to false)
```

### Vision Models

Vision models require structured JSON prompts. See `vision-prompt.json` for the correct format:

```json
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

### Usage Tracking

Track costs and usage by project/team:

```yaml
config:
  usageContext:
    project: "customer-support"
    team: "engineering"
    environment: "production"
```

### AI Gateway Features

Enable safety features and PII handling:

```yaml
config:
  aiGatewayConfig:
    enableSafety: true
    piiHandling: "mask"  # Options: none, block, mask
```

## Monitoring

Usage data is available in Databricks system tables:
- `system.serving.endpoint_usage` - Token usage and metrics
- `system.serving.served_entities` - Endpoint metadata

Query example:
```sql
SELECT * FROM system.serving.endpoint_usage 
WHERE endpoint_name = 'databricks-meta-llama-3-3-70b-instruct'
ORDER BY request_time DESC
LIMIT 100;
```

## Troubleshooting

1. **Authentication errors**: Ensure your token has the necessary permissions
2. **Endpoint not found**: Verify endpoint names match exactly
3. **Rate limits**: Consider provisioned throughput for high-volume testing
4. **PII in responses**: Enable AI Gateway PII handling features
5. **Vision model errors**: Ensure you're using the JSON prompt format, not simple string prompts

## Learn More

- [Databricks Foundation Model APIs](https://docs.databricks.com/en/machine-learning/foundation-models/index.html)
- [promptfoo documentation](https://www.promptfoo.dev/docs/providers/databricks) 