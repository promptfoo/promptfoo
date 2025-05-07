# OpenAI Image Generation Example

A simple example showing how to evaluate OpenAI's image generation models (DALL-E and GPT Image) with promptfoo.

## Quick Start

You can run this example with:

```bash
# Create this example
npx promptfoo@latest init --example openai-dalle-images

# Set your API key
export OPENAI_API_KEY=your-key-here

# Run the evaluation with DALL-E models
promptfoo eval

# To run with the GPT Image model
promptfoo eval -c promptfooconfig.gpt-image-1.yaml

# View the results
promptfoo view
```

## What's in this Example

- Tests artistic style prompts for DALL-E models
- Tests illustration styles with the GPT Image model
- Compares outputs across multiple models:
  - DALL-E 3 (high quality, better at following instructions)
  - DALL-E 2 (faster, lower cost)
  - GPT Image (superior text rendering and real-world knowledge)
- Configures different image sizes, qualities, and formats
- Tests with a variety of subjects

## Prerequisites

- An OpenAI API key with access to image generation models
- For the GPT Image model (`gpt-image-1`), you may need to complete [API Organization Verification](https://help.openai.com/en/articles/10910291-api-organization-verification) in your OpenAI account

## Model Configurations

### DALL-E Models (`promptfooconfig.yaml`)
- Each DALL-E model supports different sizes:
  - DALL-E 3: 1024x1024, 1792x1024, 1024x1792
  - DALL-E 2: 256x256, 512x512, 1024x1024
- `response_format: b64_json` returns raw JSON with base64-encoded image data. Image links with the default format `url` expire after ~ 2 hours.

### GPT Image Model (`promptfooconfig.gpt-image-1.yaml`)
- Supports more configuration options:
  - Sizes: 1024x1024, 1536x1024, 1024x1536, auto
  - Quality levels: low, medium, high, auto
  - Background: transparent or opaque
  - Output formats: png, jpeg, webp (with compression)
  - Moderation: standard (auto) or less restrictive (low)
- Superior at instruction following and text rendering
- Better with real-world knowledge and detailed compositions
- Supports advanced editing capabilities including inpainting (editing with masks)
- Token usage and cost varies significantly based on quality settings
- **Note:** Unlike DALL-E models, GPT Image always returns base64-encoded image data rather than URLs. The library formats this as a clean JSON object with essential information and a truncated preview of the base64 data for better readability.

### Working with GPT Image Responses

To save a GPT Image response as an actual image file, you can:

1. Copy the full base64 data from the response (not shown in the UI preview)
2. Use a tool like this [Base64 to Image converter](https://codebeautify.org/base64-to-image-converter)
3. Or save programmatically:

```javascript
// Node.js example
const fs = require('fs');
const imageData = response.data; // The full base64 string
const buffer = Buffer.from(imageData, 'base64');
fs.writeFileSync('image.png', buffer);
```

```python
# Python example
import base64
with open('image.png', 'wb') as f:
    f.write(base64.b64decode(response['data']))
```

## Documentation

- [OpenAI Image Models Documentation](https://platform.openai.com/docs/guides/images)
- [promptfoo OpenAI Provider Documentation](https://promptfoo.dev/docs/providers/openai)
