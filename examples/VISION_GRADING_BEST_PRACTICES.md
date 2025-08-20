# Vision Grading Best Practices

## Executive Summary

**Vision grading in promptfoo is simpler than you think!** The core implementation automatically handles images when you use a vision-capable grading model. No complex code needed.

## The Golden Rule

**Just use a vision-capable grading model, and images in vars are automatically included.**

```yaml
tests:
  - vars:
      image: file://image.png
    assert:
      - type: llm-rubric
        value: "Does the description match the image?"
        provider: openai:gpt-4o-mini  # ← That's all you need!
```

## Best Practices

### ✅ DO

1. **Keep it simple** - Use the automatic image inclusion
   ```yaml
   vars:
     image: file://my-image.png
   assert:
     - type: llm-rubric
       value: "Your criteria"
       provider: openai:gpt-4o-mini
   ```

2. **Use YAML for custom rubrics** - More readable and maintainable
   ```yaml
   rubricPrompt:
     - role: system
       content: "Custom evaluation instructions"
     - role: user
       content: "Output: {{ output }}"
   ```

3. **Use external YAML files** for reusable rubrics
   ```yaml
   rubricPrompt: file://rubrics/standard.yaml
   ```

4. **Let promptfoo handle provider formatting** - It knows what each provider needs

### ❌ DON'T

1. **Don't write JavaScript rubric files** to manually format images
2. **Don't handle provider-specific formatting** yourself
3. **Don't overcomplicate** with unnecessary custom code
4. **Don't forget** that images use ~40-50K tokens

## How It Actually Works

### Behind the Scenes
1. **Detection**: `matchers.ts` detects base64 images in vars
2. **Formatting**: `formatImageForProvider()` handles provider differences
3. **Inclusion**: Images are automatically added to grading prompts
4. **Evaluation**: Vision model sees and evaluates the images

### Provider Formats (Handled Automatically)
- **OpenAI**: `type: "image_url"`
- **Anthropic**: `type: "image"` 
- **Gemini**: `parts` with `inline_data`
- **Nova**: `content` with `image` object

You don't need to know this - promptfoo handles it!

## Example Configurations

### Minimal (Recommended)
```yaml
tests:
  - vars:
      image: file://test.png
    assert:
      - type: llm-rubric
        value: "Evaluation criteria"
        provider: openai:gpt-4o-mini
```

### With Custom YAML Rubric
```yaml
tests:
  - vars:
      image: file://test.png
    assert:
      - type: llm-rubric
        value: "Criteria"
        provider: openai:gpt-4o-mini
        rubricPrompt:
          - role: system
            content: "You are a strict visual evaluator"
          - role: user
            content: |
              Output: {{ output }}
              Check against the image provided.
```

### G-Eval with Vision
```yaml
tests:
  - vars:
      image: file://chart.png
    assert:
      - type: g-eval
        value: "Chart should be accurately described"
        provider: openai:gpt-4o-mini
```

## Directory Structure

### Good Structure
```
examples/
├── vision-grading-simplified/     # Clear, descriptive name
│   ├── promptfooconfig.yaml      # Simple, clean config
│   ├── rubrics/
│   │   └── standard.yaml         # YAML rubrics
│   └── README.md                 # Clear documentation
```

### Avoid
```
examples/
├── vision-grading/                # Too generic
│   ├── rubrics/
│   │   ├── openai.js            # ❌ JavaScript rubrics
│   │   ├── anthropic.js         # ❌ Provider-specific
│   │   └── complex-logic.js     # ❌ Unnecessary complexity
```

## Migration Guide

### From JavaScript to YAML Rubrics

**Before (JavaScript):**
```javascript
// openai.js - Complex and unnecessary
module.exports = function(output, rubric, vars) {
  // Complex image formatting logic...
  return JSON.stringify([...]);
}
```

**After (YAML):**
```yaml
# standard.yaml - Simple and clean
- role: user
  content: |
    Output: {{ output }}
    Rubric: {{ rubric }}
    # Images automatically included!
```

## Common Pitfalls

1. **Overengineering** - The system is already smart
2. **Manual formatting** - Let promptfoo handle it
3. **Provider-specific code** - One approach works for all
4. **Missing the simple solution** - Just use a vision model!

## The Bottom Line

Vision grading in promptfoo is **production-ready and simple**:

1. Load image → `file://image.png`
2. Use vision model → `provider: openai:gpt-4o-mini`
3. Done! ✅

Everything else is handled automatically. Keep it simple!
