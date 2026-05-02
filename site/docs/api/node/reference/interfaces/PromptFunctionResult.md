[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / PromptFunctionResult

# Interface: PromptFunctionResult

Defined in: [types/prompts.ts:34](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L34)

Result type for prompt functions.

Prompt functions can return:

- A string (used directly as the prompt)
- An object/array (JSON stringified and used as the prompt)
- A PromptFunctionResult object with prompt and optional config

## Properties

### config?

> `optional` **config?**: `Record`\<`string`, `any`\>

Defined in: [types/prompts.ts:36](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L36)

---

### prompt

> **prompt**: `any`

Defined in: [types/prompts.ts:35](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L35)
