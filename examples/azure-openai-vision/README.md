# azure-openai-vision (Azure OpenAI Vision Model Example)

This example demonstrates how to use Azure OpenAI's vision-capable models to analyze images with promptfoo.

You can run this example with:

```bash
npx promptfoo@latest init --example azure-openai-vision
```

## Features Demonstrated

- Using Azure OpenAI's vision models (GPT-4o, GPT-4 Turbo with Vision)
- Analyzing images from URLs and base64-encoded local files
- JSON-formatted prompts for multi-modal inputs
- Testing OCR and image understanding capabilities
- Proper Azure authentication configuration

## Prerequisites

1. An Azure OpenAI resource with a vision-capable deployment
2. Your Azure OpenAI API key set as `AZURE_API_KEY` environment variable

## Setup

Set your Azure API key:

```bash
export AZURE_API_KEY="your-api-key-here"
```

Update `promptfooconfig.yaml` with your deployment details:

```yaml
providers:
  - id: azure:chat:your-deployment-name
    config:
      apiHost: 'your-resource.openai.azure.com'
      # apiKey is omitted - loaded from AZURE_API_KEY
      apiVersion: '2025-01-01-preview'
```

## Running the Example

```bash
# Run the evaluation
npx promptfoo eval

# View results in the web UI
npx promptfoo view
```

## Converting Local Images

To test with local images, convert them to base64:

```bash
node convert-image-to-base64.js path/to/your/image.jpg
```

Then use the output in your test cases as a data URI.

## Troubleshooting

### 401 Authentication Error

- Ensure `AZURE_API_KEY` is set correctly
- Don't use `${AZURE_API_KEY}` syntax in config - omit `apiKey` field entirely
- Verify your deployment name matches exactly (case-sensitive)
- Check `apiHost` is just the hostname without `https://`

### Model Doesn't Understand Images

- Ensure your deployment uses a vision-capable model
- Verify API version is `2024-10-21` or newer
- Check message format matches the JSON structure in `prompt.json`

## Documentation

- [Azure OpenAI Vision Documentation](https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/gpt-with-vision)
- [promptfoo Azure Provider Documentation](https://promptfoo.dev/docs/providers/azure#using-vision-models)
