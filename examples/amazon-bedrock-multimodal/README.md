# amazon-bedrock-multimodal (Llama 3.2 Multimodal with Amazon Bedrock)

This example demonstrates how to use Llama 3.2's multimodal capabilities (image understanding) with Amazon Bedrock in promptfoo.

## Overview

Llama 3.2 is a powerful multimodal LLM that can understand and describe images. This example shows how to:

1. Configure promptfoo to use Llama 3.2 with Amazon Bedrock
2. Create proper prompts with embedded images
3. Run evaluations to test image understanding capabilities

## Prerequisites

- An AWS account with access to the Amazon Bedrock service
- Llama 3.2 enabled in your AWS account (available in us-west-2 region)
- AWS credentials configured (either via environment variables or AWS config)

## Environment Variables

This example requires the following environment variable:

- `AWS_BEDROCK_REGION` - The AWS region where Llama 3.2 is available (typically us-west-2)

You can also use standard AWS environment variables:

- `AWS_ACCESS_KEY_ID` - Your AWS access key
- `AWS_SECRET_ACCESS_KEY` - Your AWS secret key
- `AWS_SESSION_TOKEN` - (Optional) Your AWS session token if using temporary credentials

## Running the Example

You can run this example with:

```bash
npx promptfoo@latest init --example amazon-bedrock-multimodal
```

Then:

1. Place your test images in the `images/` directory
2. Update the config file if needed to match your image paths
3. Run the evaluation:

```bash
npx promptfoo eval
```

## How It Works

The example uses a special JSON format in the prompt template to indicate image content:

```json
[
  {
    "role": "user",
    "content": [
      {
        "text": "{{question}}"
      },
      {
        "image": {
          "source": {
            "type": "localFile",
            "path": "{{image_path}}"
          }
        }
      }
    ]
  }
]
```

When promptfoo processes this prompt, it:

1. Loads the specified image from disk
2. Converts it to the proper format for the Bedrock Converse API
3. Sends both the text question and image to the Llama 3.2 model
4. Returns the model's response describing the image

## Additional Notes

- Image format should be one of: jpeg, png, gif, or webp
- Make sure your AWS account has the proper permissions to access Llama 3.2
- The Converse API is used behind the scenes to handle multimodal content
