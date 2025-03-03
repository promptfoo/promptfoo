# Voyage AI Embeddings Example

This example demonstrates both text and multimodal embeddings using Voyage AI's models.

## Files

- `promptfooconfig.yaml`: Main configuration file
- `prompts.json`: Contains prompts for both text and multimodal embeddings
  - First prompt: Simple text embedding
  - Second prompt: Multimodal embedding with text and image

## Setup

1. Set your environment variables:
   ```bash
   export VOYAGE_API_KEY=your_voyage_api_key
   export ANTHROPIC_API_KEY=your_anthropic_api_key
   ```

## Running the Tests

Run the evaluation:

```bash
promptfoo eval
```

View the results:

```bash
promptfoo view
```

## What's Being Tested

1. Text Embeddings:

   - Using `voyage-3-large` to compare semantic similarity of text descriptions
   - Testing with different fruits and their descriptions

2. Multimodal Embeddings:
   - Using `voyage-multimodal-3` to compare text+image inputs
   - Testing with fruit images and their descriptions
   - Demonstrates how to use image URLs in your prompts

## Prompt Structure

The `prompts.json` file contains:

1. Text prompt: Simple string format

   ```json
   "Describe {{item}}"
   ```

2. Multimodal prompt: Array with content array containing text and image
   ```json
   [
     {
       "content": [
         {
           "type": "text",
           "text": "Describe {{item}}"
         },
         {
           "type": "image_url",
           "image_url": "{{image_url}}"
         }
       ]
     }
   ]
   ```
