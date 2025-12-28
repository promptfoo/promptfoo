# Provider Prompt Reporting Example

This example demonstrates how custom providers can report the **actual prompt** they sent to the LLM, rather than the original template-rendered prompt.

## The Problem

Frameworks like GenAIScript dynamically generate prompts inside the provider. Without prompt reporting, promptfoo would show the JavaScript source code or template as the "prompt" instead of what was actually sent to the LLM. This breaks:

- Prompt-based assertions (moderation, contains, etc.)
- UI display (shows wrong prompt)
- Debugging experience

## The Solution

Providers can include a `prompt` field in their response:

```javascript
return {
  output: "The LLM's response",
  prompt: "The actual prompt that was sent to the LLM",
};
```

This prompt is then used for:

1. **Assertions** - Prompt-based assertions like `icontains` with `transform: prompt` check this value
2. **UI Display** - The web UI shows "Actual Prompt Sent" instead of the template
3. **Moderation** - The moderation assertion checks this prompt for policy violations

## Running the Example

```bash
# From the repository root
npm run local -- eval -c examples/provider-prompt-reporting/promptfooconfig.yaml
```

## Files

- `dynamicPromptProvider.mjs` - Example provider that generates prompts dynamically
- `promptfooconfig.yaml` - Configuration showing how assertions work with the reported prompt

## Use Cases

- **GenAIScript** - Report the script-generated prompt
- **Agent frameworks** - Report the final prompt after tool use
- **Multi-turn conversations** - Report the full conversation context
- **Prompt optimization** - Report the optimized prompt variant used
