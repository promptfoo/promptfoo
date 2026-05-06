---
title: 'Type Alias: PromptContent'
---

> **PromptContent** = `string` \| `object`

Defined in: [types/prompts.ts:25](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L25)

Prompt payload accepted from function-valued prompts.

Strings are sent as-is. Structured values such as chat-message arrays are
accepted through the `object` branch and are JSON-stringified before the
provider receives them.

## Example

```ts
const textPrompt: PromptContent = 'Summarize this.';
const chatPrompt: PromptContent = [{ role: 'user', content: 'Summarize this.' }];
```
