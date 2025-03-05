# Azure Providers for PromptFoo

This directory contains Azure-specific provider implementations for PromptFoo.

## Available Providers

### Azure Moderation Provider

The `AzureModerationProvider` integrates with the Azure Content Safety API to provide content moderation capabilities. It analyzes text for harmful content and returns flags for any detected issues.

#### Environment Variables

- `AZURE_CONTENT_SAFETY_ENDPOINT`: The endpoint URL for the Azure Content Safety service
- `AZURE_CONTENT_SAFETY_API_VERSION`: The API version to use (default: "2024-09-01")
- `AZURE_CONTENT_SAFETY_API_KEY`: The API key for Azure Content Safety service (preferred)
- `AZURE_API_KEY`: The API key for Azure services (fallback)

#### Configuration

```javascript
const config = {
  providers: [
    {
      id: 'azure-moderation',
      provider: 'azure-moderation',
      config: {
        endpoint: 'https://your-resource-name.cognitiveservices.azure.com',
        apiKey: 'your-api-key',
        apiVersion: '2024-09-01',
      },
    },
  ],
};
```

#### Moderation Categories

The Azure Content Safety API checks content for these categories:

- Hate
- SelfHarm
- Sexual
- Violence

Each category is returned with a severity level that indicates the confidence of the detection.

## Automatic Configuration

When Azure OpenAI is configured and the `AZURE_CONTENT_SAFETY_ENDPOINT` environment variable is set, PromptFoo will automatically use the Azure Content Safety service for moderation instead of OpenAI's moderation API.
