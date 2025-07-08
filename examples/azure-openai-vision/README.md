# Azure OpenAI Vision Example

This example demonstrates how to use Azure OpenAI's vision-capable models to analyze images with promptfoo.

## Prerequisites

1. An Azure OpenAI resource with a vision-capable deployment (e.g., GPT-4.1 Mini, GPT-4o)
2. Your Azure OpenAI API key

## Setup

1. Set your Azure API key in your environment or `.env` file:

   ```bash
   export AZURE_API_KEY="your-api-key-here"
   ```

2. Update `promptfooconfig.yaml` with your Azure resource details:
   ```yaml
   providers:
     - id: azure:chat:your-deployment-name
       config:
         apiHost: 'your-resource.openai.azure.com'
         apiKey: ${AZURE_API_KEY}
         apiVersion: '2025-01-01-preview'
   ```

## Running the Example

```bash
npx promptfoo@latest eval
```

View results in the web UI:

```bash
npx promptfoo@latest view
```

## How It Works

### Message Format

Vision models require a specific message format with content arrays. See `prompt.json` for the format:

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

### Image Input Options

1. **URL Images**: Direct URLs to images on the web
2. **Base64 Images**: Local images encoded as base64 data URIs

### Example Tests

The example includes three test cases:

1. Basic image recognition (cat image)
2. OCR/text extraction (receipt analysis)
3. Local image analysis using base64 encoding

## Troubleshooting

- **401 Unauthorized**: Check your API key is set correctly
- **404 Not Found**: Verify your deployment name matches your Azure resource
- **"Model doesn't understand image data"**: Ensure you're using a vision-capable model and API version 2024-10-21 or newer

## Additional Resources

- [Azure OpenAI Documentation](https://learn.microsoft.com/en-us/azure/ai-services/openai/)
- [Promptfoo Azure Provider Docs](https://promptfoo.dev/docs/providers/azure)
