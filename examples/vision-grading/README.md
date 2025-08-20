# vision-grading

This example demonstrates how to use **custom rubric prompts** to enable vision-based grading in promptfoo, where the grading model can actually see and evaluate images, not just text descriptions.

## How It Works

Instead of modifying promptfoo's core code, we use custom rubric prompts that:
1. Format the grading prompt as a proper multi-modal message
2. Include the image data in the message sent to the grading model
3. Return the formatted JSON that the grading provider expects

This approach:
- ✅ Follows promptfoo conventions
- ✅ Works with any vision-capable grading model
- ✅ Doesn't require code changes
- ✅ Is fully configurable per test

## Setup

You can run this example with:

```bash
npx promptfoo@latest init --example vision-grading
```

### Prerequisites

- Set your API key for a vision-capable model:
  ```bash
  export OPENAI_API_KEY=your_api_key
  # or
  export ANTHROPIC_API_KEY=your_api_key
  # or
  export GOOGLE_API_KEY=your_api_key
  ```

## Project Structure

```
vision-grading/
├── rubric-prompts/          # Custom rubric prompt functions
│   ├── vision-llm-rubric.js    # LLM-rubric with vision support
│   ├── vision-g-eval.js        # G-Eval with vision support
│   └── vision-rubric-multi-provider.js  # Multi-provider support
├── test-images/             # Test images
│   ├── shapes.png          # Geometric shapes
│   └── chart.png           # Bar chart
└── promptfooconfig.yaml    # Example configuration
```

## Using Custom Rubric Prompts

### For LLM-Rubric

```yaml
assert:
  - type: llm-rubric
    value: "Your evaluation criteria here"
    # Point to custom rubric prompt that includes images
    rubricPrompt: file://rubric-prompts/vision-llm-rubric.js
```

### For G-Eval

```yaml
assert:
  - type: g-eval
    value: "Your evaluation criteria here"
    rubricPrompt:
      steps: file://rubric-prompts/vision-g-eval.js:steps
      evaluate: file://rubric-prompts/vision-g-eval.js:evaluate
```

## How Custom Rubric Prompts Work

A custom rubric prompt is a JavaScript function that receives context and returns a formatted message string:

```javascript
module.exports = function(context) {
  const { output, rubric, vars } = context;
  
  // Build message with text and images
  const messageContent = [
    { type: 'text', text: 'Your grading prompt...' }
  ];
  
  // Add images from vars
  if (vars.image) {
    messageContent.push({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${vars.image}` }
    });
  }
  
  // Return formatted message
  return JSON.stringify([
    { role: 'user', content: messageContent }
  ]);
};
```

## Multi-Provider Support

The `vision-rubric-multi-provider.js` example shows how to support different providers:

```javascript
// Detects provider and formats accordingly:
// - OpenAI: type: 'image_url'
// - Anthropic: type: 'image' 
// - Gemini: parts with inline_data
// - Nova: content with image object
```

## Running the Example

```bash
# Run with local development version
npm run local -- eval -c examples/vision-grading/promptfooconfig.yaml

# Or with npx
npx promptfoo@latest eval -c promptfooconfig.yaml
```

## Important Notes

1. **Vision-Capable Models Required**: Both the model being tested AND the grading model must support vision (e.g., GPT-4o, Claude 3.5, Gemini 1.5)

2. **Token Usage**: Sending images to grading models increases token usage. Consider this in your costs.

3. **Image Format**: Images should be base64-encoded PNG/JPEG data or loaded via `file://` references.

4. **Provider Detection**: The multi-provider rubric can detect the provider type and format messages accordingly.

## Extending This Example

You can create custom rubric prompts for:
- Different evaluation criteria
- Different image types (diagrams, photos, charts)
- Multi-image comparisons
- Image-to-image evaluations

## Comparison with Text-Only Grading

| Approach | Pros | Cons |
|----------|------|------|
| **Vision Grading** (this example) | Grading model sees actual images | Higher token usage |
| **Text-Only Grading** (default) | Lower token usage | Grading based only on text description |

Choose based on your evaluation needs and budget constraints.
