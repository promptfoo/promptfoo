---
title: 'Interface: PromptConfig'
---

Defined in: [types/prompts.ts:40](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L40)

Prompt-local text decoration applied before provider execution.

## Example

```ts
const config: PromptConfig = {
  prefix: 'System: ',
  suffix: '\nAnswer briefly.',
};
```

## Extended by

- [`TestCaseOptions`](TestCaseOptions.md)

## Properties

### prefix?

> `optional` **prefix?**: `string`

Defined in: [types/prompts.ts:42](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L42)

Text prepended to the rendered prompt before it is sent to the provider.

---

### suffix?

> `optional` **suffix?**: `string`

Defined in: [types/prompts.ts:44](https://github.com/promptfoo/promptfoo/blob/main/src/types/prompts.ts#L44)

Text appended to the rendered prompt before it is sent to the provider.
