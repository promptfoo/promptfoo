# azure-openai-vision

This example demonstrates how to use Azure OpenAI's vision-capable models to analyze images with promptfoo.

You can run this example with:

```bash
npx promptfoo@latest init --example azure-openai-vision
```

## Features

- Analyze images from URLs or local files
- Extract text from images (OCR)
- Compare responses across different vision models
- Test image understanding capabilities

## Prerequisites

1. An Azure OpenAI resource with a vision-capable deployment (e.g., GPT-4o, GPT-4 Turbo with Vision)
2. Your Azure OpenAI API key

## Setup

### Environment Variables

This example requires the following environment variable:

- `AZURE_API_KEY` - Your Azure OpenAI API key

You can set this in a `.env` file or export it directly:

```bash
export AZURE_API_KEY="your-api-key-here"
```

### Configuration

Update `promptfooconfig.yaml` with your Azure resource details:

```yaml
providers:
  - id: azure:chat:your-deployment-name
    config:
      apiHost: 'your-resource.openai.azure.com'
      apiKey: ${AZURE_API_KEY}
      apiVersion: '2025-01-01-preview' # Minimum: 2024-10-21
```

## Running the Example

Basic evaluation:

```bash
npx promptfoo@latest eval
```

Compare multiple models:

```bash
npx promptfoo@latest eval -c promptfooconfig-compare-models.yaml
```

View results in the web UI:

```bash
npx promptfoo@latest view
```

## Message Format

Vision models require a specific message format with content arrays containing both text and image inputs. The format is defined in `prompt.json`:

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

## Image Input Methods

### URL Images

Provide direct URLs to images hosted on the web:

```yaml
image_url: 'https://example.com/image.jpg'
```

### Base64 Images

Convert local images to base64 data URIs using the included utility:

```bash
node convert-image-to-base64.js path/to/your/image.jpg
```

Then use the output in your test:

```yaml
image_url: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...'
```

## Test Cases

This example includes three test scenarios:

1. **Basic Recognition**: Identifies objects in an image
2. **Text Extraction**: Extracts text/numbers from receipts or documents
3. **Base64 Handling**: Demonstrates local image analysis

## Image Limitations

- Maximum size: 20MB for URL images
- Supported formats: JPEG, PNG, GIF, BMP, WEBP
- Images are automatically resized to 2048x2048 pixels (preserving aspect ratio)

## Troubleshooting

| Error                                 | Solution                                          |
| ------------------------------------- | ------------------------------------------------- |
| 401 Unauthorized                      | Verify your `AZURE_API_KEY` is correct            |
| 404 Not Found                         | Check deployment name matches your Azure resource |
| "Model doesn't understand image data" | Ensure deployment uses a vision-capable model     |
| Invalid API version                   | Use API version `2024-10-21` or newer             |

## Cost Considerations

Vision models typically have higher token costs due to image processing. Monitor your usage through the Azure portal.

## Additional Resources

- [Azure OpenAI Vision Documentation](https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/gpt-with-vision)
- [Promptfoo Azure Provider Documentation](https://promptfoo.dev/docs/providers/azure)
