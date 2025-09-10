# Azure OpenAI Responses API Testing Setup

To test the Azure implementation, you need to configure Azure OpenAI credentials:

## Required Environment Variables

Set these environment variables:

```bash
# Required: Your Azure OpenAI resource hostname
export AZURE_API_HOST="your-resource.openai.azure.com"

# Required: Your Azure OpenAI API key
export AZURE_API_KEY="your-azure-api-key"

# Optional: API version (defaults to 2024-12-01-preview)
export AZURE_API_VERSION="2024-12-01-preview"
```

## Alternative: Provider Config

Or configure directly in the YAML:

```yaml
providers:
  - id: azure:responses:gpt-4o-mini
    config:
      apiHost: your-resource.openai.azure.com
      apiKey: your-azure-api-key
      apiVersion: "2024-12-01-preview"  # optional
```

## Test Commands

Once configured, run these tests:

```bash
# Test basic functionality
npm run local -- eval -c azure-openai-parity-test.yaml --no-cache

# Test specific features
npm run local -- eval -c examples/openai-responses/promptfooconfig.external-format.yaml --provider azure:responses:gpt-4o-mini --no-cache
```