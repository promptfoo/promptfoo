# OpenAI Responses API Example

This example demonstrates how to use the OpenAI Responses API with promptfoo. The Responses API is OpenAI's most advanced interface for generating model responses, supporting text and image inputs, and text outputs.

## Features Demonstrated

- Basic text prompt using the Responses API
- Structured prompt with image input
- Setting API-specific parameters like `instructions` and `max_output_tokens`

## Environment Variables

This example requires the following environment variables:

- `OPENAI_API_KEY` - Your OpenAI API key

## Configuration

The example uses the following configuration in `promptfooconfig.yaml`:

```yaml
prompts:
  - 'Tell me a short story about {{topic}}'
  - file://prompt.json # Structured prompt with image

providers:
  - id: openai:responses:gpt-4o
    config:
      temperature: 0.7
      max_output_tokens: 500
      instructions: 'You are a helpful, creative AI assistant. Answer questions concisely.'

tests:
  - vars:
      topic: a magical forest
  - vars:
      topic: space exploration
      image_url: https://images.unsplash.com/photo-1451187580459-43490279c0fa
```

## Structured Prompt

The `prompt.json` file demonstrates how to create a structured prompt with both text and image inputs:

```json
[
  {
    "type": "message",
    "role": "user",
    "content": [
      {
        "type": "input_text",
        "text": "Describe what you see in this image and tell me a short story inspired by it about {{topic}}."
      },
      {
        "type": "input_image",
        "image_url": "{{image_url}}"
      }
    ]
  }
]
```

## Supported Models

The Responses API supports a variety of models including:

- `gpt-4o` - OpenAI's most capable vision model
- `o1` - Powerful reasoning model
- `o1-mini` - Smaller, more affordable reasoning model
- `o1-pro` - Enhanced reasoning model with more compute (higher pricing)
- `o3-mini` - Latest reasoning model with improved performance

The `o1-pro` model uses more compute to produce better quality answers, with pricing at $150/1M tokens for input and $600/1M tokens for output.

## Usage

You can run this example with:

```bash
npx promptfoo@latest init --example openai-responses
```

Or manually:

1. Set your OpenAI API key:

   ```
   export OPENAI_API_KEY=your-api-key
   ```

2. Navigate to this directory and run promptfoo:
   ```
   npx promptfoo@latest evaluate
   ```

## Additional Features

The OpenAI Responses API supports many advanced features not demonstrated in this basic example:

- Function calling with custom tools
- Conversation state with `previous_response_id`
- Structured outputs (JSON)
- Parallel tool calls
- Reasoning models (o1, o3-mini)

Consult the [OpenAI Responses API documentation](https://platform.openai.com/docs/api-reference/responses) for more details.
