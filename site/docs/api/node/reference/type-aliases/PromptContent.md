[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / PromptContent

# Type Alias: PromptContent

> **PromptContent** = `string` \| `object`

Defined in: [types/prompts.ts:24](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L24)

Prompt payload accepted from function-valued prompts.

Strings are used directly. Objects and arrays are JSON-stringified before the
provider receives them.

## Example

```ts
const textPrompt: PromptContent = 'Summarize this.';
const chatPrompt: PromptContent = [{ role: 'user', content: 'Summarize this.' }];
```
