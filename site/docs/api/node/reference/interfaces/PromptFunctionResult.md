[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / PromptFunctionResult

# Interface: PromptFunctionResult

Defined in: [types/prompts.ts:90](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L90)

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

Defined in: [types/prompts.ts:94](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L94)

Provider config overrides to merge for this rendered prompt.

---

### prompt

> **prompt**: [`PromptContent`](../type-aliases/PromptContent.md)

Defined in: [types/prompts.ts:92](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L92)

Prompt content to send to the provider.
