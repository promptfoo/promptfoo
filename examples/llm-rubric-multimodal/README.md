# Multi-modal LLM-Rubric Example

This example demonstrates vision-based evaluation using LLM-Rubric with provider-specific formatting.

## Features

- **Provider-specific rubric prompts** for optimal image formatting
- **Multi-modal evaluation** where grading models can see actual images
- **Cross-provider testing** with OpenAI, Anthropic, Gemini, and Nova

## Structure

```
llm-rubric-multimodal/
├── rubrics/              # Provider-specific rubric formatters
│   ├── openai.js        # OpenAI vision format
│   ├── anthropic.js     # Claude vision format
│   ├── gemini.js        # Gemini vision format
│   └── bedrock-nova.js  # Nova vision format
├── shapes.png           # Test image with geometric shapes
├── chart.png            # Test image with bar chart
└── promptfooconfig.yaml # Main configuration
```

## How It Works

1. **Image Loading**: Images are loaded from files as base64
2. **Provider Detection**: The appropriate rubric formatter is selected
3. **Format Conversion**: Images are formatted for the specific provider
4. **Vision Grading**: The grading model sees and evaluates the actual images

## Provider-Specific Formats

### OpenAI
```json
{
  "type": "image_url",
  "image_url": {
    "url": "data:image/png;base64,..."
  }
}
```

### Anthropic
```json
{
  "type": "image",
  "source": {
    "type": "base64",
    "media_type": "image/png",
    "data": "..."
  }
}
```

### Gemini
```json
{
  "inline_data": {
    "mime_type": "image/png",
    "data": "..."
  }
}
```

### Nova
```json
{
  "image": {
    "format": "png",
    "source": {
      "bytes": "..."
    }
  }
}
```

## Running the Example

```bash
# Run with all providers
npx promptfoo eval

# Run with specific provider
npx promptfoo eval --filter-providers openai

# View results
npx promptfoo view
```

## Requirements

- API keys for the providers you want to test
- Vision-capable models (GPT-4V, Claude 3, Gemini 1.5, Nova)

## Token Usage

Expect significantly higher token usage (~40-50K) due to image processing.
