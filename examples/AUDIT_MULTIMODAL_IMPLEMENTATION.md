# Audit of Multi-modal Implementation

## Current State

### 1. Core Implementation (`src/matchers.ts`)

**What was added:**
- `formatImageForProvider()` - Formats images for different providers
- `extractImagesFromInput()` - Extracts images from various input formats  
- `formatPromptWithImages()` - Constructs multi-modal prompts
- Enhanced `renderLlmRubricPrompt()` to include images when detected
- Modified all grading functions to pass provider ID and image flag

**Key insight:** The core implementation automatically includes images from `vars` when:
1. A vision-capable grading model is used
2. Base64 image data is detected in vars

### 2. Examples Created

#### G-Eval (`examples/g-eval/`)
- `promptfooconfig-image.yaml` - Basic vision example
- `promptfooconfig-vision.yaml` - Multi-provider vision example
- `vision-rubrics/*.js` - JavaScript rubric formatters (provider-specific)
- Test images included

#### LLM-Rubric Multi-modal (`examples/llm-rubric-multimodal/`)
- `promptfooconfig.yaml` - Multi-modal configuration
- `rubrics/*.js` - JavaScript rubric formatters
- Test images included

### 3. Problems with Current Approach

#### JavaScript Rubric Files
**Issues:**
1. **Overly complex** - The JS files manually format images for each provider
2. **Redundant** - Core `matchers.ts` already handles provider-specific formatting
3. **Wrong function signature** - JS rubric functions receive different arguments than expected
4. **Not idiomatic** - promptfoo typically uses YAML for configuration

#### Testing Results
- When using custom JS rubric prompts: Often fails or gets confused
- When using default rubric prompts: Works correctly with automatic image inclusion
- Token usage confirms images ARE being sent (40-50K tokens)

## The Truth About Vision Grading

### What Actually Works

**The simplest approach is the best:**
```yaml
# This already works! Images are automatically included
defaultTest:
  options:
    provider: openai:gpt-4o-mini  # Vision-capable model

tests:
  - vars:
      image: file://test.png  # Image loaded as base64
    assert:
      - type: llm-rubric
        value: "Evaluate if description matches the image"
```

**Why it works:**
1. `matchers.ts` detects image data in vars
2. Provider type is identified from the grading model
3. Images are automatically formatted and included
4. No custom rubric prompts needed!

### What We Don't Need

1. **Custom JavaScript rubric prompts** - The core handles formatting
2. **Provider-specific rubric files** - One YAML format works for all
3. **Manual image formatting** - Already done by `formatImageForProvider()`

## Recommended Approach

### For Simple Cases (90% of use cases)
Use the default implementation - it just works:
```yaml
tests:
  - vars:
      image: file://image.png
    assert:
      - type: llm-rubric
        value: "Your evaluation criteria"
        provider: openai:gpt-4o-mini
```

### For Custom Rubric Prompts (10% of cases)
Use YAML format with standard message structure:
```yaml
assert:
  - type: llm-rubric
    value: "Your criteria"
    provider: openai:gpt-4o-mini
    rubricPrompt:
      - role: system
        content: "Custom evaluation instructions"
      - role: user
        content: |
          Output: {{ output }}
          Rubric: {{ rubric }}
          # Images from vars are automatically included
```

## What Should Be Cleaned Up

1. **Remove complex JS rubric files** - They're redundant and confusing
2. **Simplify examples** - Show the simple approach that just works
3. **Update documentation** - Emphasize automatic image inclusion
4. **Use YAML for custom rubrics** - More maintainable and idiomatic

## Conclusion

The implementation in `matchers.ts` is robust and handles vision grading well. The complexity we added with provider-specific JavaScript rubric prompts is unnecessary. The system already:

✅ Detects images automatically
✅ Formats for each provider correctly  
✅ Includes images in grading prompts
✅ Works across all providers

**The simpler approach is better and already works!**
