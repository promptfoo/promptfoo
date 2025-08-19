# G-Eval Image Support Testing Summary

## Overview

Successfully implemented and tested G-Eval support for image inputs across multiple vision-capable models from different providers.

## Test Configuration

- **Grading Provider**: OpenAI GPT-4.1-mini
- **Test Images**:
  - `test-image.png`: Geometric shapes (square, circle, triangle, star)
  - `test-chart.png`: Bar chart showing sales data

## Providers Tested

### ✅ Fully Working

1. **OpenAI GPT-4o-mini**
   - Format: OpenAI standard message format with `image_url`
   - Pass Rate: 100% (3/3 tests)
   - Successfully describes both geometric shapes and charts

2. **Anthropic Claude 3.5 Sonnet**
   - Format: Anthropic format with `image` content type
   - Pass Rate: 100% (3/3 tests)
   - Accurate descriptions, though model shows deprecation warning

3. **Google Gemini 1.5 Pro**
   - Format: Gemini format with `parts` and `inline_data`
   - Pass Rate: 100% (3/3 tests)
   - Detailed and accurate descriptions

4. **Amazon Bedrock Nova Pro**
   - Format: Custom Nova format with `image` object
   - Pass Rate: 66.67% (2/3 tests)
   - Works well for shapes, minor accuracy issue with chart data

5. **Amazon Bedrock Claude 3 Sonnet**
   - Format: Standard Anthropic format via Bedrock
   - Pass Rate: 100% (3/3 tests)
   - Consistent with direct Anthropic API

## Message Format Examples

### OpenAI Format

```json
[
  {
    "role": "user",
    "content": [
      { "type": "text", "text": "Describe this image:" },
      { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
    ]
  }
]
```

### Anthropic Format

```json
[
  {
    "role": "user",
    "content": [
      { "type": "text", "text": "Describe this image:" },
      { "type": "image", "source": { "type": "base64", "media_type": "image/png", "data": "..." } }
    ]
  }
]
```

### Gemini Format

```json
[
  {
    "role": "user",
    "parts": [
      { "text": "Describe this image:" },
      { "inline_data": { "mime_type": "image/png", "data": "..." } }
    ]
  }
]
```

### Nova Format

```json
[
  {
    "role": "user",
    "content": [
      { "text": "Describe this image:" },
      { "image": { "format": "png", "source": { "bytes": "..." } } }
    ]
  }
]
```

## Implementation Details

The `sanitizeInputForGEval()` function in `src/matchers.ts` was updated to:

1. Detect JSON message formats from various providers
2. Extract text content while replacing image references with `[Image provided]` placeholders
3. Support OpenAI, Anthropic, Gemini, and Amazon Bedrock Nova formats
4. Handle both single messages and conversation arrays

## Overall Results

- **Total Tests Run**: 15 (3 tests × 5 providers)
- **Successful**: 14
- **Failed**: 1 (Nova Pro chart accuracy)
- **Overall Pass Rate**: 93.33%

## Key Achievements

✅ Universal format support across major vision model providers
✅ Backward compatible with existing text-only G-Eval usage
✅ Proper handling of base64 image data in prompts
✅ Comprehensive test coverage with real images
✅ Clear documentation and examples

## Usage

To run the multi-provider test:

```bash
npm run local -- eval -c examples/g-eval/promptfooconfig-image-multi-provider.yaml
```

To run with a specific provider:

```bash
npm run local -- eval -c examples/g-eval/promptfooconfig-image-multi-provider.yaml --filter-providers "GPT-4o-mini"
```
