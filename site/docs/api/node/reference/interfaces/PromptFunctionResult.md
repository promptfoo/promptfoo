[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / PromptFunctionResult

# Interface: PromptFunctionResult

Defined in: [types/prompts.ts:50](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L50)

Result type for prompt functions.

Prompt functions can return:

- A string (used directly as the prompt)
- An object/array (JSON stringified and used as the prompt)
- A PromptFunctionResult object with prompt and optional config

## Properties

### config?

> `optional` **config?**: `Record`\<`string`, `any`\>

Defined in: [types/prompts.ts:54](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L54)

Provider config overrides to merge for this rendered prompt.

---

### prompt

> **prompt**: [`PromptContent`](../type-aliases/PromptContent.md)

Defined in: [types/prompts.ts:52](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L52)

Prompt content to send to the provider.
