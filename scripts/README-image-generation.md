# Blog Image Generation Scripts

This directory contains scripts for generating blog hero images using OpenAI's image generation models.

## Available Scripts

### 1. `generate-system-cards-image.js`

Uses the new gpt-image-1 model (if you have access to it).

### 2. `generate-system-cards-image-dalle3.js`

Uses the standard DALL-E 3 model (recommended for most users).

## Setup

1. Get an OpenAI API key from: https://platform.openai.com/api-keys
2. Set the API key as an environment variable:
   ```bash
   export OPENAI_API_KEY="your-api-key-here"
   ```

## Usage

To generate a hero image for the system cards blog post:

```bash
# Using DALL-E 3 (recommended)
node scripts/generate-system-cards-image-dalle3.js

# Using gpt-image-1 (if you have access)
node scripts/generate-system-cards-image.js
```

The generated image will be saved to: `site/static/img/blog/system-cards-hero.png`

## Customizing the Prompt

To generate images for other blog posts, edit the `prompt` variable in the script to describe the image you want. Keep these guidelines in mind:

- Include the red panda mascot for brand consistency
- Use Promptfoo's color palette: deep purples, teals, and orange accents
- Maintain a professional but approachable style
- Consider the blog post topic and make the image relevant

## Troubleshooting

- **"Invalid API key"**: Make sure your OPENAI_API_KEY environment variable is set correctly
- **"Insufficient credits"**: Check your OpenAI account balance at https://platform.openai.com/usage
- **"Model not found"**: If gpt-image-1 isn't available, use the DALL-E 3 script instead
