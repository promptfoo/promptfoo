[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / PromptFunctionResult

# Interface: PromptFunctionResult

Defined in: [types/prompts.ts:39](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L39)

Result type for prompt functions.

Prompt functions can return:

- A string (used directly as the prompt)
- An object/array (JSON stringified and used as the prompt)
- A PromptFunctionResult object with prompt and optional config

## Properties

### config?

> `optional` **config?**: `Record`\<`string`, `any`\>

Defined in: [types/prompts.ts:41](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L41)

---

### prompt

> **prompt**: `any`

Defined in: [types/prompts.ts:40](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L40)
