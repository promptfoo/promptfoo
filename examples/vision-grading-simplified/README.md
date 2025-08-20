# Vision Grading - The Right Way

This example demonstrates the **correct and simplest** way to do vision-based grading in promptfoo.

## Key Insight

**You don't need complex custom code!** Just use a vision-capable grading model, and images in vars are automatically included.

## How It Works

1. **Automatic Image Detection**: promptfoo detects base64 images in vars
2. **Automatic Provider Formatting**: Images are formatted correctly for each provider
3. **Automatic Inclusion**: Images are included in grading prompts automatically

## The Simplest Approach (Recommended)

```yaml
tests:
  - vars:
      image: file://test-image.png  # Image loaded as base64
    assert:
      - type: llm-rubric
        value: "Evaluate if description matches the image"
        provider: openai:gpt-4o-mini  # Just use a vision model!
```

That's it! The grading model will see the image and evaluate accordingly.

## Rubric Prompt Options

### Option 1: Default (No Custom Rubric)
```yaml
assert:
  - type: llm-rubric
    value: "Your evaluation criteria"
    provider: openai:gpt-4o-mini
```

### Option 2: Inline YAML Rubric
```yaml
assert:
  - type: llm-rubric
    value: "Your criteria"
    provider: openai:gpt-4o-mini
    rubricPrompt:
      - role: system
        content: "Custom instructions"
      - role: user
        content: "Output: {{ output }}"
```

### Option 3: External YAML File
```yaml
assert:
  - type: llm-rubric
    value: "Your criteria"
    provider: openai:gpt-4o-mini
    rubricPrompt: file://rubrics/vision.yaml
```

## What NOT to Do

❌ **Don't** write complex JavaScript rubric files to manually format images
❌ **Don't** try to handle provider-specific formatting yourself
❌ **Don't** overcomplicate things!

## Supported Providers

Any vision-capable model works automatically:
- OpenAI: `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`
- Anthropic: `claude-3-opus`, `claude-3-sonnet`, `claude-3-haiku`
- Google: `gemini-1.5-pro`, `gemini-1.5-flash`
- Amazon: `nova-pro`, `nova-lite`

## Running the Example

```bash
# Basic test
npx promptfoo eval

# Test specific provider
npx promptfoo eval --filter-providers openai

# View results
npx promptfoo view
```

## Token Usage

Expect ~40-50K tokens for grading with images (vs ~2-3K for text-only).

## The Bottom Line

Vision grading in promptfoo is **already simple and automatic**. Just:
1. Put images in vars
2. Use a vision-capable grading model
3. That's it!

The system handles all the complexity for you.
