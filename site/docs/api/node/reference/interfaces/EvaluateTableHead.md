[**promptfoo**](../README.md)

---

[promptfoo](../README.md) / EvaluateTableHead

# Interface: EvaluateTableHead

Defined in: [types/index.ts:666](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L666)

Header metadata for an eval table.

## Example

```ts
const head: EvaluateTableHead = {
  prompts: [],
  vars: ['name'],
};
```

## Properties

### prompts

> **prompts**: [`CompletedPrompt`](CompletedPrompt.md)[]

Defined in: [types/index.ts:668](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L668)

Completed prompts rendered as provider columns.

---

### vars

> **vars**: `string`[]

Defined in: [types/index.ts:670](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L670)

Variable names rendered before provider columns.
