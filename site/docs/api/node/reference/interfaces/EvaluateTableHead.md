---
title: 'Interface: EvaluateTableHead'
description: 'Header metadata for an eval table.'
---

## Import

```ts
import type { EvaluateTableHead } from 'promptfoo';
```

Defined in: [types/index.ts:683](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L683)

Header metadata for an eval table.

`prompts` and `vars` define the visible column order used by rows in the
matching `EvaluateTable.body`.

## Example

```ts
const head: EvaluateTableHead = {
  prompts: [
    {
      raw: 'Hello {{name}}',
      label: 'Greeting',
      provider: 'custom:echo',
    },
  ],
  vars: ['name'],
};
```

## Properties

### prompts

> **prompts**: [`CompletedPrompt`](CompletedPrompt.md)[]

Defined in: [types/index.ts:685](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L685)

Completed prompts rendered as provider columns.

---

### vars

> **vars**: `string`[]

Defined in: [types/index.ts:687](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L687)

Variable names rendered before provider columns.
