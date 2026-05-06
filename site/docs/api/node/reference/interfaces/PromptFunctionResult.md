---
title: 'Interface: PromptFunctionResult'
---

Defined in: [types/prompts.ts:91](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L91)

Result type for prompt functions.

Prompt functions can return:

- A string (used directly as the prompt)
- An object/array (JSON stringified and used as the prompt)
- A PromptFunctionResult object with prompt and optional config

## Example

```ts
const result: PromptFunctionResult = {
  prompt: 'Summarize this article.',
  config: { temperature: 0.2 },
};
```

## Properties

### config?

> `optional` **config?**: `Record`\<`string`, `any`\>

Defined in: [types/prompts.ts:95](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L95)

Provider config overrides to merge for this rendered prompt.

---

### prompt

> **prompt**: [`PromptContent`](../type-aliases/PromptContent.md)

Defined in: [types/prompts.ts:93](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L93)

Prompt content to send to the provider.
