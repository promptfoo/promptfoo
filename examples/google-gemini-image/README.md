# Google Gemini 2.5 Flash Image Generation Example

This example demonstrates how to use Google's Gemini 2.5 Flash Image model (also known as "nano-banana") with promptfoo for AI image generation and evaluation.

## Features Demonstrated

- **Image Generation**: Create images from text descriptions
- **Artistic Styles**: Generate images in specific artistic styles (watercolor, digital art, etc.)
- **Character Consistency**: Maintain consistent character designs across generations
- **Creative Transformations**: Show transformations and progressions in images
- **Mixed Responses**: Handle responses containing both text and images
- **Cost Tracking**: Accurate cost calculation and monitoring
- **Multi-Provider Support**: Works with both Google AI Studio and Vertex AI

## Prerequisites

Choose one of two authentication methods:

### Option 1: Google AI Studio (Recommended for Development)

1. **Google API Key**: Get an API key from [Google AI Studio](https://aistudio.google.com/apikey)
2. **Environment Setup**: Set your API key as `GEMINI_API_KEY` environment variable

```bash
export GEMINI_API_KEY="your_google_ai_studio_api_key"
```

### Option 2: Vertex AI (Recommended for Production)

1. **Google Cloud Project**: Set up a Google Cloud project with Vertex AI enabled
2. **Authentication**: Use Application Default Credentials or service account

```bash
# Using gcloud (recommended)
gcloud auth application-default login

# Or set service account credentials
export GOOGLE_APPLICATION_CREDENTIALS="path/to/service-account.json"
export GOOGLE_PROJECT_ID="your-gcp-project-id"
```

## Model Information

- **Model ID**:
  - Google AI Studio: `google:gemini-2.5-flash-image-preview`
  - Vertex AI: `vertex:gemini-2.5-flash-image-preview`
- **Capabilities**: Text-to-image generation with natural language understanding
- **Pricing**: $30 per 1M output tokens (~$0.039 per image with 1290 tokens per image)
- **Response Format**: Returns images as base64-encoded data in markdown format
- **Cost Tracking**: Automatically calculates and tracks costs per request

## Running the Example

1. Navigate to this directory:

```bash
cd examples/google-gemini-image
```

2. Run the evaluation:

```bash
promptfoo eval
```

3. View the results:

```bash
promptfoo view
```

The generated images will be displayed inline in the web viewer interface.

## Configuration Highlights

### Provider Configuration

```yaml
providers:
  - id: google:gemini-2.5-flash-image-preview
    config:
      generationConfig:
        temperature: 0.7
        maxOutputTokens: 1024
        responseModalities:
          - IMAGE
          - TEXT
```

### Key Features

#### Response Modalities

The `responseModalities` setting enables both image and text generation:

- `IMAGE`: Enables image generation capability
- `TEXT`: Allows text descriptions alongside images

#### Temperature Control

Controls the creativity and randomness of generated images:

- `0.1-0.4`: More deterministic, consistent results
- `0.5-0.8`: Balanced creativity and consistency
- `0.9-1.0`: Highly creative and varied results

## Example Prompts

### Basic Image Generation

```
Generate an image of a beautiful sunset over mountains
```

### Artistic Style Control

```
Create a watercolor style image of a peaceful lake surrounded by trees.
The image should have soft, warm lighting and include reflections on the water.
```

### Character Consistency

```
Generate an image of a friendly robot character named Robo.
The robot should be blue and silver colored, have friendly expression,
and be in a futuristic laboratory setting.
```

### Creative Transformations

```
Create an image that shows the changing of seasons from winter to spring.
Start with a snow-covered forest and transform it to blooming spring.
```

## Evaluation Assertions

The example includes several types of assertions to validate image generation:

1. **Format Validation**: Check for proper markdown image format

```yaml
assert:
  - type: contains
    value: '![Generated Image]'
  - type: contains
    value: 'data:image'
```

2. **Content Quality**: Use LLM-based evaluation for artistic quality

```yaml
assert:
  - type: llm-rubric
    value: 'Should generate an artistic watercolor-style landscape image'
```

## Tips for Best Results

1. **Detailed Prompts**: More specific descriptions lead to better results
2. **Style Keywords**: Include artistic style terms (watercolor, digital art, photorealistic)
3. **Lighting & Mood**: Specify lighting conditions and emotional tone
4. **Composition**: Mention framing, perspective, and composition elements
5. **Character Consistency**: Use consistent naming and detailed character descriptions

## Troubleshooting

### Images Not Displaying

If generated images don't display in the web viewer:

- Check that the API response contains base64 image data
- Verify the markdown format: `![Generated Image](data:image/png;base64,...)`
- Ensure the TruncatedText component isn't cutting off base64 data

### API Errors

- Verify your `GEMINI_API_KEY` is set correctly
- Check that you have access to the Gemini 2.5 Flash Image preview
- Ensure your API key has sufficient quota

### Performance Notes

- Image generation takes longer than text-only models
- Each image costs approximately 1290 tokens
- Consider using smaller test sets for cost management

## Next Steps

- Experiment with different artistic styles and techniques
- Try combining multiple images in a single prompt
- Use the model for creative applications like storyboarding
- Integrate with other evaluation metrics for comprehensive assessment

For more information about Google Gemini models, see the [Google provider documentation](../../site/docs/providers/google.md).
