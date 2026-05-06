---
title: 'Interface: EvaluateTable'
description: 'Table-shaped eval output used by generateTable() and the web UI.'
---

## Import

```ts
import type { EvaluateTable } from 'promptfoo';
```

Defined in: [types/index.ts:683](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L683)

Table-shaped eval output used by `generateTable()` and the web UI.

Read this when you need the presentation-oriented table model. Use the eval
record summary APIs instead when you need per-result analysis rather than
terminal or UI rendering.

## Example

```ts
const table: EvaluateTable = {
  head: { prompts: [], vars: ['name'] },
  body: [],
};
```

## Properties

### body

> **body**: [`EvaluateTableRow`](EvaluateTableRow.md)[]

Defined in: [types/index.ts:687](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L687)

Ordered table rows, one per evaluated test case.

---

### head

> **head**: [`EvaluateTableHead`](EvaluateTableHead.md)

Defined in: [types/index.ts:685](https://github.com/promptfoo/promptfoo/blob/main/src/types/index.ts#L685)

Prompt and variable headers rendered above the table body.
