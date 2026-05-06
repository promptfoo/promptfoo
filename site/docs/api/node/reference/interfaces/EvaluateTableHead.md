---
title: 'Interface: EvaluateTableHead'
---

Defined in: [types/index.ts:656](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L656)

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

Defined in: [types/index.ts:658](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L658)

Completed prompts rendered as provider columns.

---

### vars

> **vars**: `string`[]

Defined in: [types/index.ts:660](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L660)

Variable names rendered before provider columns.
