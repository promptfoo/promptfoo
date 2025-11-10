# azure-openai

This example demonstrates how to use Azure OpenAI with promptfoo, including text generation and vision capabilities.

You can run this example with:

```bash
npx promptfoo@latest init --example azure-openai
```

## Environment Variables

This example requires the following environment variables:

- `AZURE_API_KEY` - Your Azure OpenAI API key
- `AZURE_OPENAI_API_KEY` - Alternative environment variable for your Azure OpenAI API key

You can set these in a `.env` file or directly in your environment.

## Prerequisites

1. An Azure account with access to Azure OpenAI Service
2. Deployments for one or more Azure OpenAI models:
   - Text models: gpt-4o, o3-mini
   - Vision models: gpt-4o (or other vision-capable models)
3. Your Azure OpenAI endpoint URL

## Setup Instructions

1. Update the `apiHost` in the configuration files to your Azure OpenAI endpoint
2. Set `AZURE_API_KEY` in your environment
3. Update the deployment names to match your actual deployments

## Available Examples

### Basic Text Generation

```bash
npx promptfoo@latest eval
# or
npx promptfoo@latest eval -c promptfooconfig.yaml
```

### Vision Models

```bash
npx promptfoo@latest eval -c promptfooconfig.vision.yaml
```

Demonstrates three ways to provide images to vision models:

- **URL**: Direct link to an image on the web
- **Local file**: Using `file://` paths (automatically converted to base64)
- **Base64**: Pre-encoded image data URI

## Troubleshooting

If you get a 401 error:

- Ensure your `AZURE_API_KEY` is set correctly
- Verify your endpoint URL is correct (no https://)
- Check that your deployment supports the requested capabilities

## Additional Resources

- [Azure OpenAI Provider Documentation](https://promptfoo.dev/docs/providers/azure/)
- [Azure OpenAI Service Documentation](https://learn.microsoft.com/en-us/azure/ai-services/openai/)
- [Azure OpenAI Vision Documentation](https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/gpt-with-vision)
