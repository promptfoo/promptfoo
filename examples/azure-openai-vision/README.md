# azure-openai-vision (Azure OpenAI Vision Model Example)

This example demonstrates how to use Azure OpenAI's vision models (like GPT-4o) to analyze images.

You can run this example with:

```bash
npx promptfoo@latest eval
```

## Features Demonstrated

- 🖼️ Image analysis using URLs and local files
- 📝 OCR (Optical Character Recognition)
- 🎨 Complex scene understanding
- 🔍 Object and species identification

## Prerequisites

1. An Azure OpenAI resource with a GPT-4 Vision deployment (e.g., gpt-4o)
2. Your Azure API key set as an environment variable

## Setup

1. Set your Azure API key:

   ```bash
   export AZURE_API_KEY=your-api-key-here
   ```

2. Update `promptfooconfig.yaml` with your Azure OpenAI deployment details:
   - `apiHost`: Your Azure OpenAI endpoint (e.g., `your-resource.openai.azure.com`)
   - `apiVersion`: The API version (e.g., `2024-02-15-preview`)

3. Add your test images to the `assets/` directory:
   - `street-sign.jpg` - An image containing text for OCR testing
   - `landscape.jpg` - A scenic image for complex scene analysis
   - `abstract-art.png` - An image for artistic interpretation

## Running the Example

```bash
npx promptfoo@latest eval
```

Then view the results:

```bash
npx promptfoo@latest view
```

## Image Input Methods

This example demonstrates three ways to provide images:

1. **Direct URLs**: Use any publicly accessible image URL

   ```yaml
   image_url: https://example.com/image.jpg
   ```

2. **Local files**: Use `file://` to automatically load and encode local images

   ```yaml
   image_url: file://assets/my-image.jpg
   ```

3. **Base64 data**: Provide pre-encoded base64 image data
   ```yaml
   image_url: data:image/jpeg;base64,/9j/4AAQSkZJRg...
   ```

When using `file://` paths, promptfoo automatically:

- Loads the image file
- Converts it to base64
- Formats it correctly for the vision API

## Troubleshooting

### 401 Unauthorized Error

- Verify your `AZURE_API_KEY` environment variable is set correctly
- Check that your Azure endpoint and deployment name are correct
- Ensure your API key has access to the specified deployment

### 404 Not Found Error

- Verify the deployment name in your configuration
- Check that you're using a vision-capable model (e.g., gpt-4o)
- Ensure the API version supports vision features

### Image Loading Issues

- For local files, ensure the path is relative to where you run promptfoo
- Check that image files exist and have proper read permissions
- Supported formats: JPEG, PNG, GIF, WebP

## Learn More

- [Azure OpenAI Vision Documentation](https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/gpt-with-vision)
- [Promptfoo Azure Provider Documentation](https://www.promptfoo.dev/docs/providers/azure/)
- [Promptfoo Configuration Reference](https://www.promptfoo.dev/docs/configuration/reference/)
