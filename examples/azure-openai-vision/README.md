# Azure OpenAI Vision Example

This example demonstrates how to use Azure OpenAI's vision-capable models (like GPT-4o) to analyze images using promptfoo.

## Features Demonstrated

- Using Azure OpenAI with vision/image inputs
- Testing with both URL-based and base64-encoded images
- Proper message formatting for vision models
- Various image analysis scenarios (object detection, OCR, detailed analysis)

## Prerequisites

1. An Azure OpenAI resource with a GPT-4o or GPT-4 Turbo with Vision deployment
2. Your Azure OpenAI endpoint and API key

## Setup

1. Set your environment variables:
   ```bash
   export AZURE_OPENAI_API_KEY="your-api-key-here"
   ```

2. Update the `promptfooconfig.yaml` file:
   - Replace `your-resource-name` with your actual Azure OpenAI resource name
   - Replace `gpt-4o-deployment` with your actual deployment name

## Running the Example

```bash
npx promptfoo@latest eval
```

To view the results in the web UI:
```bash
npx promptfoo@latest view
```

## Configuration Details

### Important Settings

1. **API Version**: The example uses `apiVersion: '2024-10-21'` which supports vision capabilities. Make sure to use this version or newer.

2. **Message Format**: Vision models require a specific message format with content arrays:
   ```json
   {
     "role": "user",
     "content": [
       {
         "type": "text",
         "text": "Your question here"
       },
       {
         "type": "image_url",
         "image_url": {
           "url": "image URL or base64 data URI"
         }
       }
     ]
   }
   ```

3. **Base64 Images**: When using base64-encoded images, use the format:
   ```
   data:image/jpeg;base64,YOUR_BASE64_DATA
   data:image/png;base64,YOUR_BASE64_DATA
   ```

### Test Cases

The example includes several test cases:

1. **Basic Image Analysis**: Tests the model's ability to describe what's in an image
2. **Base64 Image Handling**: Verifies that base64-encoded images work correctly
3. **OCR/Text Extraction**: Tests extracting text or numbers from images (e.g., receipts)
4. **Detailed Analysis**: Tests multi-aspect image analysis

## Troubleshooting

### Common Issues

1. **"Model doesn't understand image data"**
   - Ensure your deployment uses a vision-capable model (GPT-4o or GPT-4 Turbo with Vision)
   - Verify the API version is recent (2024-10-21 or newer)
   - Check that the message format matches the example

2. **Base64 images not working**
   - Ensure the data URI format is correct: `data:image/[type];base64,[data]`
   - Keep base64 images reasonably sized
   - Verify the base64 encoding is valid

3. **Authentication errors**
   - Verify your API key is set correctly
   - Ensure your resource name and deployment name are correct
   - Check that your deployment is active in Azure Portal

### Image Limitations

- Maximum image size: 20MB for URLs
- Supported formats: JPEG, PNG, GIF, BMP, WEBP
- Images are resized to fit within 2048 x 2048 pixels while preserving aspect ratio

## Comparing with OpenAI

To compare results with standard OpenAI, uncomment the OpenAI provider in the configuration and set your OpenAI API key:

```bash
export OPENAI_API_KEY="your-openai-api-key"
```

## Additional Resources

- [Azure OpenAI Vision Documentation](https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/gpt-with-vision)
- [promptfoo Azure Provider Documentation](https://promptfoo.dev/docs/providers/azure/)
- [OpenAI Vision Best Practices](https://platform.openai.com/docs/guides/vision) 