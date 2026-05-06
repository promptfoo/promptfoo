---
title: 'Interface: EvaluateTableHead'
description: 'Header metadata for an eval table.'
---

## Import

```ts
import type { EvaluateTableHead } from 'promptfoo';
```

Defined in: [types/index.ts:659](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L659)

Header metadata for an eval table.

`prompts` and `vars` define the visible column order used by rows in the
matching `EvaluateTable.body`.

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

Defined in: [types/index.ts:661](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L661)

Completed prompts rendered as provider columns.

---

### vars

> **vars**: `string`[]

Defined in: [types/index.ts:663](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L663)

Variable names rendered before provider columns.
