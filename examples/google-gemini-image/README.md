# google-gemini-image

This example demonstrates how to use Google's Gemini native image generation models with promptfoo.

## Prerequisites

Get an API key from [Google AI Studio](https://aistudio.google.com/apikey) and set it:

```bash
export GOOGLE_API_KEY="your_api_key"
# or
export GEMINI_API_KEY="your_api_key"
```

## Supported Models

- `google:gemini-2.5-flash-image` - Fast image generation (recommended)
- `google:gemini-3-pro-image-preview` - Advanced image generation with reasoning

## Running the Example

```bash
cd examples/google-gemini-image
npx promptfoo@latest init --example google-gemini-image
promptfoo eval
promptfoo view
```

## Configuration

```yaml
providers:
  - id: google:gemini-2.5-flash-image
    config:
      imageAspectRatio: '16:9' # Optional: 1:1, 4:3, 16:9, etc.
```

## Assertions

Check that an image was generated:

```yaml
assert:
  - type: contains
    value: '![Generated Image](data:image/'
```

Use LLM to grade image quality:

```yaml
assert:
  - type: llm-rubric
    value: 'Rate this image for professional quality'
    provider: google:gemini-2.5-flash
```

## Example Configs

- `promptfooconfig.yaml` - Basic image generation
- `test-simple-grading.yaml` - Generate and grade with llm-rubric
- `test-generate-then-grade.yaml` - Generate image, then analyze
- `test-image-analysis.yaml` - Analyze existing images
- `test-image-input-output.yaml` - Image transformation workflows

For more information, see the [Google provider documentation](../../site/docs/providers/google.md).
