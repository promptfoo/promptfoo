# LLM-Rubric Image Handling Analysis

## Current Behavior

### What happens with llm-rubric and images:

1. **Image data is passed through**: The base64 image data from vars is passed to the grading model via the grading prompt context
2. **Success with both vision and non-vision models**: Tests pass with both GPT-4o-mini (vision) and GPT-3.5-turbo (non-vision) as grading models
3. **Grading is based on text output only**: The grading model evaluates the generated text description, not the image itself

### Key Findings from Testing:

```javascript
// Debug output shows:
Available variables:
  image: [string, length: 6064]  // Base64 image data
    -> Appears to be base64 data
  extra_var: "This is a test variable"
```

The image variable (containing base64 data) is available in the grading context and passed to the grading model.

## Comparison with G-Eval

| Aspect                   | G-Eval                                            | llm-rubric                          |
| ------------------------ | ------------------------------------------------- | ----------------------------------- |
| Image handling           | Sanitizes input, replaces with `[Image provided]` | Passes raw base64 data through vars |
| Token usage              | Lower (no image data sent)                        | Higher (includes base64 data)       |
| Grading focus            | Text description only                             | Text description only               |
| Vision model requirement | No                                                | No (but sends data anyway)          |

## Potential Issues with Current llm-rubric Behavior

1. **Unnecessary token usage**: Sending base64 image data to the grading model increases token count significantly
2. **Potential confusion**: Grading models might try to process base64 strings as text
3. **Inconsistency**: Different behavior from G-Eval for similar use cases

## Should llm-rubric Be Modified?

### Arguments FOR sanitizing images in llm-rubric:
- **Efficiency**: Reduce token usage by not sending unnecessary base64 data
- **Consistency**: Match G-Eval's behavior for similar evaluation scenarios
- **Clarity**: Grading should focus on the text output, not the input image

### Arguments AGAINST sanitizing images in llm-rubric:
- **Flexibility**: Some rubrics might want to reference the original image (if grading model supports vision)
- **Backward compatibility**: Existing use cases might depend on vars being passed through
- **Different purpose**: llm-rubric is more general-purpose than G-Eval

## Recommendation

For image inputs, llm-rubric should:

1. **Keep current behavior by default** for backward compatibility
2. **Optionally allow sanitization** via a configuration flag
3. **Document the behavior** clearly so users understand the token implications

This preserves flexibility while allowing users to optimize for their specific use case. 