# redteam-multi-modal (Image Analysis Example)

This example demonstrates how to use multimodal models in AWS Bedrock to analyze images and answer questions about them.

## Overview

This example shows how to:

- Construct a static prompt for multimodal analysis
- Use Claude and Nova models with image inputs
- Test different types of image-related questions
- Evaluate model responses with LLM-based rubrics

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-multi-modal
```

## Environment Variables

This example requires the following environment variables:

- `AWS_BEDROCK_REGION` - Your AWS Bedrock region (e.g., 'us-east-1')
- `AWS_ACCESS_KEY_ID` - Your AWS access key
- `AWS_SECRET_ACCESS_KEY` - Your AWS secret access key

You can set these in a `.env` file or directly in your environment.

## Usage

1. Add your test images to the directory
2. Update the `promptfooconfig.yaml` file to point to your images:
   ```yaml
   tests:
     - vars:
         image: file://your-image.jpg
         question: 'Your question about the image?'
   ```
3. Run the evaluation:
   ```bash
   npx promptfoo eval
   ```

## Image Formats

The following image formats are supported:

- jpg/jpeg
- png
- gif
- bmp
- webp
- svg

## How It Works

The static prompt (`static-image-prompt.json`) uses a structured format compatible with multimodal models like Claude and Amazon Nova. It contains:

1. A system message that defines the AI's role as a visual analysis assistant
2. A user message with both image data and a text question

The configuration tests the prompt with multiple models and evaluates their performance using LLM-based rubrics that check for accuracy in image description.

## Example Questions

Here are some example questions you can ask about images:

- "What objects can you see in this image?"
- "Describe the scene in detail."
- "What colors are most prominent in this image?"
- "Are there any people in this image? If so, what are they doing?"
- "What time of day does this image appear to be taken?"
- "Can you identify any text in this image?"
- "What's the main subject of this photograph?"

## Models

This example uses the following AWS Bedrock models:

- Claude 3.7 Sonnet (anthropic.claude-3-7-sonnet-20250219-v1:0)
- Amazon Nova Pro (amazon.nova-pro-v1:0)

You can add additional models by updating the `providers` section in the configuration file.
