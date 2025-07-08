# azure-openai-vision

This example shows how to analyze images with Azure OpenAI vision models.

You can run this example with:

```bash
npx promptfoo@latest init --example azure-openai-vision
```

## Setup

1. Set your Azure API key:

   ```bash
   export AZURE_API_KEY=your-api-key-here
   ```

2. Update `promptfooconfig.yaml` with your Azure deployment:
   - Replace `your-deployment.openai.azure.com` with your Azure endpoint
   - Ensure you're using a vision-capable model (e.g., gpt-4o)

3. Run the evaluation:
   ```bash
   npx promptfoo@latest eval
   ```

## What This Example Demonstrates

Three ways to provide images to vision models:

1. **URL**: Direct link to an image on the web
2. **Local file**: Using `file://` paths (automatically converted to base64)
3. **Base64**: Pre-encoded image data URI

All three methods analyze the same Earth image to show different loading approaches.

## Troubleshooting

If you get a 401 error, check:

- Your `AZURE_API_KEY` is set correctly
- Your endpoint URL is correct (no https://)
- Your deployment supports vision

## Learn More

- [Azure OpenAI Vision Docs](https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/gpt-with-vision)
- [Promptfoo Azure Provider](https://www.promptfoo.dev/docs/providers/azure/)
